package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// getLLMEndpoint returns the complete LLM API endpoint URL
func getLLMEndpoint() string {
	baseURL := os.Getenv("LLM_URL")
	return strings.TrimSuffix(baseURL, "/") + "/chat/completions"
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

// getModelName returns the model name to use for API requests
func getModelName() string {
	modelName := os.Getenv("LLM_MODEL")
	return modelName
}

func main() {
	// Configure server
	port := "8080"
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}

	// Create a new server mux
	mux := http.NewServeMux()

	// Handler for the root path - chat interface
	mux.HandleFunc("/", handleChatInterface)

	// Handler for chat API
	mux.HandleFunc("/api/chat", handleChatAPI)

	// Start the server
	serverAddr := ":" + port
	fmt.Printf("Server starting on http://localhost%s\n", serverAddr)
	fmt.Printf("Using LLM endpoint: %s\n", getLLMEndpoint())
	fmt.Printf("Using model: %s\n", getModelName())
	log.Fatal(http.ListenAndServe(serverAddr, mux))
}

// handleChatInterface serves the chat web interface
func handleChatInterface(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	// Generate HTML response
	html := `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello-GenAI in Go</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #0078D7;
            text-align: center;
        }
        .container {
            display: flex;
            flex-direction: column;
            height: 80vh;
        }
        #chat-box {
            flex-grow: 1;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            overflow-y: auto;
            background-color: #f9f9f9;
        }
        .input-container {
            display: flex;
            gap: 10px;
        }
        #message-input {
            flex-grow: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        button {
            padding: 10px 20px;
            background-color: #0078D7;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #0056a3;
        }
        .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 4px;
        }
        .user-message {
            background-color: #e3f2fd;
            border-left: 4px solid #2196F3;
            text-align: right;
        }
        .bot-message {
            background-color: #f1f1f1;
            border-left: 4px solid #9e9e9e;
        }
        .loading {
            text-align: center;
            margin: 10px 0;
            font-style: italic;
            color: #666;
        }
        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 0.8rem;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>Hello-GenAI in Go</h1>
    <div class="container">
        <div id="chat-box">
            <div class="message bot-message">
                Hello! I'm your GenAI assistant. How can I help you today?
            </div>
        </div>
        <div class="input-container">
            <input type="text" id="message-input" placeholder="Type your message here..." autofocus>
            <button id="send-button">Send</button>
        </div>
    </div>
    <div class="footer">
        &copy; 2025 hello-genai | Powered by <span id="model-name">Loading model info...</span>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const chatBox = document.getElementById('chat-box');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            const modelNameSpan = document.getElementById('model-name');

            // Get model info
            fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: "!modelinfo" }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.model) {
                    modelNameSpan.textContent = data.model;
                } else {
                    modelNameSpan.textContent = "AI Language Model";
                }
            })
            .catch(error => {
                modelNameSpan.textContent = "AI Language Model";
            });


            function sendMessage() {
                const message = messageInput.value.trim();
                if (!message) return;

                // Add user message to chat
                addMessageToChat('user', message);
                messageInput.value = '';

                // Show loading indicator
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loading';
                loadingDiv.textContent = 'Thinking...';
                chatBox.appendChild(loadingDiv);
                chatBox.scrollTop = chatBox.scrollHeight;

                // Send message to API
                fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: message }),
                })
                .then(response => response.json())
                .then(data => {
                    // Remove loading indicator
                    chatBox.removeChild(loadingDiv);
                    
                    // Add bot's response to chat
                    addMessageToChat('bot', data.response);
                })
                .catch(error => {
                    // Remove loading indicator
                    chatBox.removeChild(loadingDiv);
                    
                    // Show error message
                    addMessageToChat('bot', 'Sorry, I encountered an error. Please try again.');
                    console.error('Error:', error);
                });
            }

            function addMessageToChat(role, content) {
                const messageDiv = document.createElement('div');
                messageDiv.className = role === 'user' ? 'message user-message' : 'message bot-message';
                messageDiv.textContent = content;
                chatBox.appendChild(messageDiv);
                chatBox.scrollTop = chatBox.scrollHeight;
            }

            // Event listeners
            sendButton.addEventListener('click', sendMessage);
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        });
    </script>
</body>
</html>
`

	// Set content type and write response
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

// handleChatAPI processes chat API requests
func handleChatAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the request body
	var requestBody struct {
		Message string `json:"message"`
	}

	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Special command for getting model info
	if requestBody.Message == "!modelinfo" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"model": getModelName(),
		})
		return
	}

	// Call the LLM API
	response, err := callLLMAPI(requestBody.Message)
	if err != nil {
		log.Printf("Error calling LLM API: %v", err)
		http.Error(w, "Failed to get response from LLM", http.StatusInternalServerError)
		return
	}

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
				Content: "You are a helpful assistant.",
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
