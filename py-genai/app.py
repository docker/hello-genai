import os
import json
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

def get_llm_endpoint():
    """Returns the complete LLM API endpoint URL"""
    base_url = os.getenv("LLM_URL", "")
    # remove trailling slash
    if base_url.endswith('/'):
        base_url = base_url[:-1]
    return f"{base_url}/chat/completions"

def get_model_name():
    """Returns the model name to use for API requests"""
    return os.getenv("LLM_MODEL", "")

@app.route('/')
def index():
    """Serves the chat web interface"""
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat_api():
    """Processes chat API requests"""
    data = request.json
    message = data.get('message', '')
    
    # Special command for getting model info
    if message == "!modelinfo":
        return jsonify({'model': get_model_name()})
    
    # Call the LLM API
    try:
        response = call_llm_api(message)
        return jsonify({'response': response})
    except Exception as e:
        app.logger.error(f"Error calling LLM API: {e}")
        return jsonify({'error': 'Failed to get response from LLM'}), 500

def call_llm_api(user_message):
    """Calls the LLM API and returns the response"""
    chat_request = {
        "model": get_model_name(),
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": user_message
            }
        ]
    }
    
    headers = {"Content-Type": "application/json"}
    
    # Send request to LLM API
    response = requests.post(
        get_llm_endpoint(),
        headers=headers,
        json=chat_request,
        timeout=30
    )
    
    # Check if the status code is not 200 OK
    if response.status_code != 200:
        raise Exception(f"API returned status code {response.status_code}: {response.text}")
    
    # Parse the response
    chat_response = response.json()
    
    # Extract the assistant's message
    if chat_response.get('choices') and len(chat_response['choices']) > 0:
        return chat_response['choices'][0]['message']['content'].strip()
    
    raise Exception("No response choices returned from API")

if __name__ == '__main__':
    port = int(os.getenv("PORT", 8080))
    
    print(f"Server starting on http://localhost:{port}")
    print(f"Using LLM endpoint: {get_llm_endpoint()}")
    print(f"Using model: {get_model_name()}")
    
    app.run(host='0.0.0.0', port=port, debug=os.getenv("DEBUG", "false").lower() == "true")