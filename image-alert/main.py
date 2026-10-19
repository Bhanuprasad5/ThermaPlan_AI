import os, json, requests
import functions_framework
from google import genai
from google.genai import types

PROJECT = os.environ["GCP_PROJECT"]
REGION = os.environ.get("REGION", "us-central1")
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

client = genai.Client(vertexai=True, project=PROJECT, location=REGION)

PROMPT = """You are monitoring images for an operations team.
Return ONLY JSON:
{"situation": "<one crisp sentence>",
 "severity": "low|medium|high|critical",
 "action_required": "<one immediate action>",
 "needs_immediate_action": true or false}"""

@functions_framework.cloud_event
def on_upload(cloud_event):
    data = cloud_event.data
    bucket, name = data["bucket"], data["name"]
    mime = data.get("contentType", "")
    if not mime.startswith("image/"):
        return
    try:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_uri(file_uri=f"gs://{bucket}/{name}", mime_type=mime),
                PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0.2),
        )
        r = json.loads(resp.text)
    except Exception as e:
        send(f"⚠️ Analysis failed for gs://{bucket}/{name}. Please review manually.\n{e}")
        return
    if r.get("needs_immediate_action"):
        icon = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🔴"}.get(r["severity"], "⚠️")
        send(f"{icon} {r['severity'].upper()} ALERT\n"
             f"Situation: {r['situation']}\n"
             f"Action needed NOW: {r['action_required']}\n"
             f"File: gs://{bucket}/{name}")

def send(text):
    requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data={"chat_id": CHAT_ID, "text": text}, timeout=15)
