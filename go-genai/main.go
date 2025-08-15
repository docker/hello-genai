package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// Configuration holds application configuration
type Configuration struct {
	Port        string
	LLMBaseURL  string
	LLMModelName string
	LogLevel    string
	Version     string
}

// Cache implementation
type Cache struct {
	items map[string]cacheItem
	mu    sync.RWMutex
}

type cacheItem struct {
	value      string
	expiration time.Time
}

// ChatRequest represents the structure of a chat request to the LLM API
type ChatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
}

// ChatMessage represents a message in the chat
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatResponse represents the response from the LLM API
type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Choices []struct {
		Index        int         `json:"index"`
		Message      ChatMessage `json:"message"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
}

// Global variables
var (
	config Configuration
	cache  = &Cache{items: make(map[string]cacheItem)}
	logger *log.Logger
	startTime = time.Now()
)

// Initialize the application
func init() {
	// Configure logger
	logger = log.New(os.Stdout, "[hello-genai] ", log.LstdFlags)

	// Load configuration
	config = loadConfig()
	
	// Log configuration
	logger.Printf("Configuration loaded: Port=%s, LLM Base URL=%s, Model=%s", 
		config.Port, config.LLMBaseURL, config.LLMModelName)
}

// loadConfig loads configuration from environment variables with defaults
func loadConfig() Configuration {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Use Docker Model Runner injected variables
	llamaURL := os.Getenv("LLAMA_URL")
	llamaModel := os.Getenv("LLAMA_MODEL")
	
	if llamaURL == "" {
		logger.Println("WARNING: No LLM endpoint configured. Set LLAMA_URL.")
	}

	if llamaModel == "" {
		logger.Println("WARNING: No LLM model configured. Set LLAMA_MODEL.")
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "INFO"
	}

	return Configuration{
		Port:        port,
		LLMBaseURL:  llamaURL,
		LLMModelName: llamaModel,
		LogLevel:    logLevel,
		Version:     "1.0.0",
	}
}

// getLLMEndpoint returns the complete LLM API endpoint URL
func getLLMEndpoint() string {
	return config.LLMBaseURL + "/chat/completions"
}

// getModelName returns the model name to use for API requests
func getModelName() string {
	return config.LLMModelName
}

// Cache methods
func (c *Cache) Get(key string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	item, found := c.items[key]
	if !found {
		return "", false
	}
	
	// Check if item has expired
	if time.Now().After(item.expiration) {
		delete(c.items, key)
		return "", false
	}
	
	return item.value, true
}

func (c *Cache) Set(key, value string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.items[key] = cacheItem{
		value:      value,
		expiration: time.Now().Add(ttl),
	}
}

// Rate limiter implementation
type RateLimiter struct {
	clients map[string][]time.Time
	mu      sync.Mutex
	limit   int
	window  time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		clients: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
	}
}

func (rl *RateLimiter) Allow(clientIP string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	
	now := time.Now()
	
	// Remove timestamps outside the window
	var validTimestamps []time.Time
	for _, ts := range rl.clients[clientIP] {
		if now.Sub(ts) <= rl.window {
			validTimestamps = append(validTimestamps, ts)
		}
	}
	
	rl.clients[clientIP] = validTimestamps
	
	// Check if client has reached the limit
	if len(validTimestamps) >= rl.limit {
		return false
	}
	
	// Add current timestamp
	rl.clients[clientIP] = append(rl.clients[clientIP], now)
	return true
}

// Create a rate limiter: 10 requests per minute
var rateLimiter = NewRateLimiter(10, time.Minute)

// Middleware for adding security headers
func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://unpkg.com; font-src 'self' data: https://unpkg.com")
		next.ServeHTTP(w, r)
	})
}

// Middleware for logging requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.Printf("%s %s %s", r.Method, r.RequestURI, time.Since(start))
	})
}

func main() {
	// Create a new router
	router := mux.NewRouter()
	
	// Apply middleware
	router.Use(securityHeadersMiddleware)
	router.Use(loggingMiddleware)
	
	// Static file server
	fs := http.FileServer(http.Dir("./static"))
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", fs))
	
	// Log the current working directory to help with debugging
	currentDir, err := os.Getwd()
	if err != nil {
		logger.Printf("Error getting current directory: %v", err)
	} else {
		logger.Printf("Current working directory: %s", currentDir)
		
		// Check if static directory exists
		if _, err := os.Stat("./static"); os.IsNotExist(err) {
			logger.Printf("WARNING: Static directory does not exist")
		} else {
			logger.Printf("Static directory exists")
			
			// Check if swagger.json exists
			if _, err := os.Stat("./static/swagger.json"); os.IsNotExist(err) {
				logger.Printf("WARNING: swagger.json does not exist")
			} else {
				logger.Printf("swagger.json exists")
			}
		}
	}
	
	// API routes
	router.HandleFunc("/api/chat", handleChatAPI).Methods("POST")
	router.HandleFunc("/health", handleHealthCheck).Methods("GET")
	router.HandleFunc("/example", handleExample).Methods("GET")
	
	// Swagger UI
	router.HandleFunc("/api/docs", handleSwaggerUI).Methods("GET")
	
	// Direct route for swagger.json - serve both at /api/swagger.json and /static/swagger.json for compatibility
	router.HandleFunc("/api/swagger.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, "./static/swagger.json")
	}).Methods("GET")
	
	// Main route
	router.HandleFunc("/", handleIndex).Methods("GET")
	
	// Debug route
	router.HandleFunc("/debug", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./templates/debug.html")
	}).Methods("GET")
	
	// Simple text endpoint for basic testing
	router.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, "pong")
	}).Methods("GET")
	
	// Start the server
	serverAddr := ":" + config.Port
	logger.Printf("Server starting on http://localhost%s", serverAddr)
	logger.Printf("Using LLM endpoint: %s", getLLMEndpoint())
	logger.Printf("Using model: %s", getModelName())
	
	// Configure server with timeouts
	server := &http.Server{
		Addr:         serverAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	log.Fatal(server.ListenAndServe())
}

// handleIndex serves the chat web interface
func handleIndex(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "./templates/index.html")
}

// handleExample serves an example of structured formatting
func handleExample(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile("./static/examples/structured_response_example.md")
	if err != nil {
		http.Error(w, "Example not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"response": string(data),
	})
}

// handleHealthCheck provides a health check endpoint
func handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	// Check if LLM API is accessible
	llmStatus := "ok"
	if config.LLMBaseURL == "" {
		llmStatus = "not_configured"
	}
	
	// Get memory stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	
	// Calculate uptime
	uptime := time.Since(startTime)
	
	// Create the response data
	healthData := map[string]interface{}{
		"status":    "healthy",
		"llm_api":   llmStatus,
		"timestamp": time.Now().Format(time.RFC3339),
		"version":   config.Version,
		"uptime":    fmt.Sprintf("%dh %dm %ds", int(uptime.Hours()), int(uptime.Minutes())%60, int(uptime.Seconds())%60),
		"memory": map[string]interface{}{
			"alloc":      fmt.Sprintf("%.2f", float64(memStats.Alloc)/1024/1024),
			"total_alloc": fmt.Sprintf("%.2f", float64(memStats.TotalAlloc)/1024/1024),
			"sys":        fmt.Sprintf("%.2f", float64(memStats.Sys)/1024/1024),
			"num_gc":     memStats.NumGC,
		},
		"go_version": runtime.Version(),
		"goroutines": runtime.NumGoroutine(),
	}
	
	// Set the content type header
	w.Header().Set("Content-Type", "application/json")
	
	// Write the response
	if err := json.NewEncoder(w).Encode(healthData); err != nil {
		logger.Printf("Error encoding health data: %v", err)
		http.Error(w, "Error generating health data", http.StatusInternalServerError)
		return
	}
}

// validateChatRequest validates and sanitizes chat API request data
func validateChatRequest(data map[string]interface{}) (bool, string) {
	message, ok := data["message"].(string)
	if !ok {
		return false, "Message is required and must be a string"
	}
	
	if len(message) > 4000 {
		return false, "Message too long (max 4000 characters)"
	}
	
	return true, message
}

// handleChatAPI processes chat API requests
func handleChatAPI(w http.ResponseWriter, r *http.Request) {
	// Apply rate limiting
	clientIP := r.RemoteAddr
	if !rateLimiter.Allow(clientIP) {
		http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
		return
	}
	
	// Parse the request body
	var requestBody map[string]interface{}
	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	// Validate request
	valid, result := validateChatRequest(requestBody)
	if !valid {
		http.Error(w, result, http.StatusBadRequest)
		return
	}
	
	message := result
	
	// Special command for getting model info
	if message == "!modelinfo" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"model": getModelName(),
		})
		return
	}
	
	// Check cache first
	if cachedResponse, found := cache.Get(message); found {
		logger.Println("Cache hit for message")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"response": cachedResponse,
		})
		return
	}
	
	// Call the LLM API
	response, err := callLLMAPI(message)
	if err != nil {
		logger.Printf("Error calling LLM API: %v", err)
		http.Error(w, "Failed to get response from LLM", http.StatusInternalServerError)
		return
	}
	
	// Cache the response (5 minutes TTL)
	cache.Set(message, response, 5*time.Minute)
	
	// Return the response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"response": response,
	})
}

// callLLMAPI calls the LLM API and returns the response
func callLLMAPI(userMessage string) (string, error) {
	// Prepare the request body
	chatRequest := ChatRequest{
		Model: getModelName(),
		Messages: []ChatMessage{
			{
				Role:    "system",
				Content: "You are a helpful assistant. Please provide structured responses using markdown formatting. Use headers (# for main points), bullet points (- for lists), bold (**text**) for emphasis, and code blocks (```code```) for code examples. Organize your responses with clear sections and concise explanations.",
			},
			{
				Role:    "user",
				Content: userMessage,
			},
		},
	}

	requestBody, err := json.Marshal(chatRequest)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create the HTTP request
	req, err := http.NewRequest("POST", getLLMEndpoint(), bytes.NewBuffer(requestBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Set a timeout for the HTTP client
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Send the request
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read the response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Check if the status code is not 200 OK
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API returned status code %d: %s", resp.StatusCode, respBody)
	}

	// Parse the response
	var chatResponse ChatResponse
	err = json.Unmarshal(respBody, &chatResponse)
	if err != nil {
		return "", fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Extract the assistant's message
	if len(chatResponse.Choices) > 0 {
		return strings.TrimSpace(chatResponse.Choices[0].Message.Content), nil
	}

	return "", fmt.Errorf("no response choices returned from API")
}

// handleSwaggerUI serves the Swagger UI for API documentation
func handleSwaggerUI(w http.ResponseWriter, r *http.Request) {
	logger.Printf("Serving Swagger UI at %s", r.URL.Path)
	
	// Check if swagger-interactive.html exists
	_, err := os.Stat("./templates/swagger-interactive.html")
	if os.IsNotExist(err) {
		logger.Printf("ERROR: swagger-interactive.html template not found")
		http.Error(w, "API documentation not available", http.StatusInternalServerError)
		return
	}
	
	// Check if swagger.json exists
	_, err = os.Stat("./static/swagger.json")
	if os.IsNotExist(err) {
		logger.Printf("ERROR: swagger.json not found")
		http.Error(w, "API documentation not available", http.StatusInternalServerError)
		return
	}
	
	// Set appropriate headers
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	
	// Serve the interactive Swagger UI
	http.ServeFile(w, r, "./templates/swagger-interactive.html")
}
