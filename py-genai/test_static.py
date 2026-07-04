import os
import signal
import subprocess
import sys
import time

import requests


def test_static_files():
    """Test that static files are being served correctly"""
    # Start the Flask app in a subprocess
    process = subprocess.Popen(
        ["python", "app.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=dict(os.environ, PORT="8081", DEBUG="false")
    )
    
    try:
        # Wait for the server to start
        time.sleep(2)
        
        # Test the favicon
        response = requests.get("http://localhost:8081/static/favicon.ico")
        assert response.status_code == 200, f"Failed to get favicon.ico: {response.status_code}"
        print("✅ Favicon test passed")
        
        # Test robots.txt
        response = requests.get("http://localhost:8081/static/robots.txt")
        assert response.status_code == 200, f"Failed to get robots.txt: {response.status_code}"
        print("✅ Robots.txt test passed")
        
        # Test the main page
        response = requests.get("http://localhost:8081/")
        assert response.status_code == 200, f"Failed to get main page: {response.status_code}"
        assert "Hello-GenAI in Python" in response.text, "Main page doesn't contain expected title"
        print("✅ Main page test passed")
        
        print("\nAll tests passed! Static files are being served correctly.")
        return True
    
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    
    finally:
        # Kill the Flask app
        process.send_signal(signal.SIGTERM)
        process.wait()

if __name__ == "__main__":
    success = test_static_files()
    sys.exit(0 if success else 1)
