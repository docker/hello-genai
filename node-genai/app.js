const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

// Helper functions
function getLLMEndpoint() {
    // Use Docker Model Runner injected variables
    const llamaUrl = process.env.LLAMA_URL;
    return `${llamaUrl}/chat/completions`;
}

function getModelName() {
    // Use Docker Model Runner injected variables
    return process.env.LLAMA_MODEL;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        llm_endpoint: getLLMEndpoint(),
        model: getModelName()
    });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    
    // Special command for model info
    if (message === '!modelinfo') {
        return res.json({ model: getModelName() });
    }
    
    try {
        const response = await callLLMAPI(message);
        return res.json({ response });
    } catch (error) {
        console.error('Error calling LLM API:', error.message);
        return res.status(500).json({ error: 'Failed to get response from LLM' });
    }
});

// Call the LLM API
async function callLLMAPI(userMessage) {
    const chatRequest = {
        model: getModelName(),
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant."
            },
            {
                role: "user",
                content: userMessage
            }
        ]
    };
    
    try {
        const response = await axios.post(
            getLLMEndpoint(),
            chatRequest,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000 // 30 seconds
            }
        );
        
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            return response.data.choices[0].message.content.trim();
        }
        
        throw new Error('No response choices returned from API');
    } catch (error) {
        if (error.response) {
            throw new Error(`API returned status code ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server starting on http://localhost:${PORT}`);
    console.log(`Using LLM endpoint: ${getLLMEndpoint()}`);
    console.log(`Using model: ${getModelName()}`);
});

