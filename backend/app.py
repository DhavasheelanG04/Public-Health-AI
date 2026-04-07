from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model import build_response, load_model

app = FastAPI(title='AI Public Health NLP Chatbot', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, description='Symptom description from the user')


@app.on_event('startup')
def warm_model() -> None:
    load_model()


@app.get('/health')
def health() -> dict:
    return {'status': 'ok'}


@app.post('/api/chat')
def chat(request: ChatRequest) -> dict:
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail='Message cannot be empty.')

    return build_response(message)
