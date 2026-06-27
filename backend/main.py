from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from pypdf import PdfReader
import pymongo
import hashlib
import json
import time
import io
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Transcript-to-Summary Backend")

# Ensure complete cross-origin coverage so frontend requests don't freeze silently
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("CRITICAL ERROR: GROQ_API_KEY is missing from your environment setup.")
client = Groq(api_key=GROQ_API_KEY)

# Connected securely to your exact Compass configuration
mongo_client = pymongo.MongoClient("mongodb://localhost:27017")
db = mongo_client["MeetingIntelligence_ReactPython"]
users_col = db["Users"]
summaries_col = db["Summaries"]

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    context_summary: str
    history: list[ChatMessage]
    user_message: str

def hash_secret(password_str):
    return hashlib.sha256(password_str.encode()).hexdigest()

def call_groq_api(prompt_payload: str, json_mode=False):
    for attempt in range(3):
        try:
            kwargs = {
                "messages": [{"role": "user", "content": prompt_payload}],
                "model": "llama-3.3-70b-versatile",
                "timeout": 30.0
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
                
            completion = client.chat.completions.create(**kwargs)
            return completion.choices[0].message.content
        except Exception as e:
            if attempt == 2:
                raise e
            time.sleep(2)

def run_ai_document_metadata_pipeline(sample_text: str, current_mode: str):
    snippet = " ".join(sample_text.split()[:1200])
    meta_prompt = (
        "Analyze this text snippet and return a strict JSON object with five keys: "
        "'detected_type', 'document_tone', 'extracted_entities' (max 5 vital items), "
        "'speakers' (an array of names/speaker tags discovered in text), and "
        "'speaker_distribution' (an array of JSON objects each having 'name' and 'percentage' keys matching text layout proportions).\n\n"
        f"Snippet text:\n{snippet}"
    )
    try:
        raw_json = call_groq_api(meta_prompt, json_mode=True)
        parsed = json.loads(raw_json)
        return (
            parsed.get("detected_type", "Text Document"),
            parsed.get("document_tone", "Neutral"),
            parsed.get("extracted_entities", []),
            parsed.get("speakers", ["Unknown Speaker"]),
            parsed.get("speaker_distribution", [{"name": "Default Speaker", "percentage": 100}])
        )
    except:
        return (current_mode if current_mode != "Auto-Detect" else "General Text", "Neutral", [], ["Speaker 1"], [{"name": "Speaker 1", "percentage": 100}])

def generate_advanced_summary(text_content: str, processing_mode: str, detected_type: str):
    words = text_content.split()
    max_chunk_words = 2000 
    chosen_style = detected_type if processing_mode == "Auto-Detect" else processing_mode
    
    if "Audit" in chosen_style or "Log" in chosen_style:
        directives = "Focus completely on isolating system errors, infrastructure failures, warnings, or action tasks."
    elif "Minutes" in chosen_style or "Meeting" in chosen_style:
        directives = "Focus strictly on project milestones, timeline agreements, assignments, and structural decisions."
    elif "Summary" in chosen_style or "Brief" in chosen_style:
        directives = "Provide an accelerated, broad context executive overview perfect for a direct manager."
    else:
        directives = "Extract core topics, central insights, and synthesize structural takeaways logically."

    if len(words) > max_chunk_words:
        chunks = [" ".join(words[i:i + max_chunk_words]) for i in range(0, len(words), max_chunk_words)]
        sub_summaries = []
        for idx, chunk in enumerate(chunks):
            map_prompt = (
                f"Extract core information from section {idx+1} of this text document. "
                f"Keep details matching these parameters: {directives}\n\nContent:\n{chunk}"
            )
            sub_summaries.append(call_groq_api(map_prompt))
        combined_text = "\n\n".join(sub_summaries)
    else:
        combined_text = text_content

    final_prompt = (
        f"Goal: Produce a clean summary outline based on this text source data.\n"
        f"Context Parameter Profile: {directives}\n\n"
        "Format your answer using exactly these identical clean headers:\n"
        "### Overview\n(Write a clear paragraph here)\n\n"
        "### Key Points\n- Point one\n- Point two\n\n"
        "### Identified Tasks\n- Task detail or next step here\n\n"
        f"Source Content Data:\n{combined_text}"
    )
    return call_groq_api(final_prompt)


# =====================================================================
# AUTHENTICATION MODULE
# =====================================================================

@app.post("/api/register")
def register(data: UserRegister):
    username_clean = data.username.strip()
    email_clean = data.email.strip()
    
    if not username_clean:
        raise HTTPException(status_code=400, detail="Validation Error: Username cannot be left empty.")
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Validation Error: A valid email address is required.")
    if len(data.password.strip()) < 4:
        raise HTTPException(status_code=400, detail="Validation Error: Password must be at least 4 characters long.")

    try:
        if users_col.find_one({"username": username_clean}):
            raise HTTPException(status_code=400, detail="Registration Refused: This username is already registered.")
            
        if users_col.find_one({"email": email_clean}):
            raise HTTPException(status_code=400, detail="Registration Refused: This email is already associated with an account.")

        users_col.insert_one({
            "username": username_clean, 
            "email": email_clean, 
            "password": hash_secret(data.password)
        })
        return {"message": "Success"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Server Error: Unable to record user. ({str(e)})")


@app.post("/api/login")
def login(data: UserLogin):
    u_clean = data.username.strip()
    if not u_clean or not data.password.strip():
        raise HTTPException(status_code=400, detail="Validation Error: All credentials fields must be supplied.")

    try:
        user = users_col.find_one({"username": u_clean})
        if user and user["password"] == hash_secret(data.password):
            return {"username": user["username"]}
        raise HTTPException(status_code=401, detail="Authentication Failure: Incorrect username or password combination.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Server Connection Drop: {str(e)}")


# =====================================================================
# CORE DOCUMENT PROCESSING WORKFLOW (WITH SPEAKER TRACKING)
# =====================================================================

@app.post("/api/process")
async def process_document(
    username: str = Form(...),
    filename: str = Form(...),
    processing_mode: str = Form(...),
    text: str = Form(None),
    file: UploadFile = File(None)
):
    try:
        final_text = ""
        if file is not None:
            filename = file.filename
            file_content = await file.read()
            
            if filename.lower().endswith('.pdf'):
                pdf_stream = io.BytesIO(file_content)
                reader = PdfReader(pdf_stream)
                extracted_pages = []
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text: extracted_pages.append(page_text)
                final_text = "\n".join(extracted_pages)
                
                if not final_text.strip():
                    raise HTTPException(status_code=400, detail="Processing Error: This PDF file contains no digital text components (scanned image error).")
            else:
                final_text = file_content.decode("utf-8", errors="ignore")
        elif text:
            final_text = text
            
        if not final_text.strip():
            raise HTTPException(status_code=400, detail="Processing Error: Submitted processing pipeline input data was empty.")

        payload_hash = hashlib.sha256(final_text.encode("utf-8", errors="ignore")).hexdigest()
        cached_instance = summaries_col.find_one({"owner": username, "file_hash": payload_hash, "processing_mode": processing_mode})
        
        if cached_instance:
            return {
                "summary": cached_instance["summary"],
                "detected_type": cached_instance.get("detected_type", "Text Document"),
                "document_tone": cached_instance.get("document_tone", "Neutral"),
                "extracted_entities": cached_instance.get("extracted_entities", []),
                "speakers": cached_instance.get("speakers", []),
                "speaker_distribution": cached_instance.get("speaker_distribution", []),
                "velocity": cached_instance.get("velocity", 0.05),
                "compression_ratio": cached_instance.get("compression_ratio", 80),
                "time_saved_mins": cached_instance.get("time_saved_mins", 3),
                "cached": True
            }

        start_time = time.perf_counter()
        detected_type, document_tone, extracted_entities, speakers, speaker_distribution = run_ai_document_metadata_pipeline(final_text, processing_mode)
        ai_response = generate_advanced_summary(final_text, processing_mode, detected_type)
        end_time = time.perf_counter()
        
        elapsed_time = round(end_time - start_time, 2)
        input_len = len(final_text.split()) if len(final_text.split()) > 0 else 1
        output_len = len(ai_response.split())
        compression_ratio = max(0, min(99, round(((input_len - output_len) / input_len) * 100)))
        time_saved_mins = max(1, round((input_len - output_len) / 200))

        summaries_col.insert_one({
            "owner": username, "filename": filename, "file_hash": payload_hash,
            "processing_mode": processing_mode, "summary": ai_response,
            "detected_type": detected_type, "document_tone": document_tone,
            "extracted_entities": extracted_entities, "speakers": speakers,
            "speaker_distribution": speaker_distribution, "velocity": elapsed_time,
            "compression_ratio": compression_ratio, "time_saved_mins": time_saved_mins
        })

        return {
            "summary": ai_response, "detected_type": detected_type, "document_tone": document_tone,
            "extracted_entities": extracted_entities, "speakers": speakers,
            "speaker_distribution": speaker_distribution, "velocity": elapsed_time,
            "compression_ratio": compression_ratio, "time_saved_mins": time_saved_mins, "cached": False
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis pipeline crash details: {str(e)}")


# =====================================================================
# INTERACTIVE CHATBOT ENGINE & HISTORY ROUTING
# =====================================================================

@app.post("/api/chat")
def chat_with_summary(payload: ChatRequest):
    try:
        system_prompt = (
            f"You are an assistant analyzing a document summary. "
            f"Context Summary:\n{payload.context_summary}\n"
            f"Answer user queries precisely using this data."
        )
        messages = [{"role": "system", "content": system_prompt}]
        for msg in payload.history[-6:]:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": payload.user_message})
        
        completion = client.chat.completions.create(
            messages=messages, model="llama-3.3-70b-versatile", timeout=15.0
        )
        return {"response": completion.choices[0].message.content}
    except Exception as e:
        return {"response": f"Chat pipeline error description: {str(e)}"}

@app.get("/api/history/{username}")
def get_history(username: str):
    if username == "Guest_User" or username == "Guest": 
        return {"history": []}
    try:
        return {"history": list(summaries_col.find({"owner": username.strip()}, {"_id": 0}))}
    except:
        return {"history": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main.py:app", host="127.0.0.1", port=8000, reload=True)