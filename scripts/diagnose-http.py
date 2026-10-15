"""Independent standard-library client; key is inherited, never printed."""
import json
import os
import time
import urllib.request

started = time.monotonic()
payload = {"model": "deepseek-flash", "messages": [{"role": "user", "content": "Reply OK."}],
           "thinking": {"type": "disabled"}, "stream": True, "max_tokens": 16}
request = urllib.request.Request("https://api.deepseek.com/chat/completions",
    data=json.dumps(payload).encode(), headers={"Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"],
    "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        print(json.dumps({"client": "python-urllib", "status": response.status,
                          "headers_ms": round((time.monotonic() - started) * 1000)}), flush=True)
        while time.monotonic() - started < 30:
            line = response.readline()
            if not line:
                break
            if line.strip():
                print(json.dumps({"seconds": round(time.monotonic() - started, 2),
                                  "body": line.decode()[:1200]}), flush=True)
except Exception as error:
    print(type(error).__name__, str(error))
