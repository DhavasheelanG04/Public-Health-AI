from __future__ import annotations

from pathlib import Path
import re

import joblib
from langdetect import LangDetectException, detect
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from data import GENERAL_FOLLOW_UP, LANGUAGE_NAMES, LOCALIZED_INTENT_PROFILES, TRAINING_EXAMPLES

ROOT_DIR = Path(__file__).resolve().parent
ARTIFACT_PATH = ROOT_DIR / 'artifacts' / 'symptom_model.joblib'

TAMIL_RE = re.compile(r'[\u0B80-\u0BFF]')
DEVANAGARI_RE = re.compile(r'[\u0900-\u097F]')

_MODEL: Pipeline | None = None


def detect_language(text: str) -> str:
    if TAMIL_RE.search(text):
        return 'ta'

    if DEVANAGARI_RE.search(text):
        return 'hi'

    try:
        detected = detect(text)
    except LangDetectException:
        return 'en'

    if detected.startswith('ta'):
        return 'ta'

    if detected.startswith('hi'):
        return 'hi'

    return 'en'


def build_model() -> Pipeline:
    texts = [sample for sample, _ in TRAINING_EXAMPLES]
    labels = [label for _, label in TRAINING_EXAMPLES]

    pipeline = Pipeline(
        [
            ('vectorizer', TfidfVectorizer(analyzer='char', ngram_range=(2, 5))),
            (
                'classifier',
                LogisticRegression(max_iter=2000),
            ),
        ]
    )
    pipeline.fit(texts, labels)

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, ARTIFACT_PATH)
    return pipeline


def load_model() -> Pipeline:
    global _MODEL

    if _MODEL is not None:
        return _MODEL

    if ARTIFACT_PATH.exists():
        _MODEL = joblib.load(ARTIFACT_PATH)
        return _MODEL

    _MODEL = build_model()
    return _MODEL


def predict_intent(text: str) -> tuple[str, float]:
    model = load_model()
    probabilities = model.predict_proba([text])[0]
    best_index = probabilities.argmax()
    label = model.classes_[best_index]
    confidence = float(probabilities[best_index])

    if confidence < 0.14:
        return 'general', confidence

    return label, confidence


def build_response(text: str) -> dict:
    language = detect_language(text)
    intent, confidence = predict_intent(text)
    profiles = LOCALIZED_INTENT_PROFILES.get(language, LOCALIZED_INTENT_PROFILES['en'])
    profile = profiles.get(intent, LOCALIZED_INTENT_PROFILES['en'][intent])

    message = profile['summary']

    if intent == 'general' and confidence < 0.45:
        message += f" {GENERAL_FOLLOW_UP.get(language, GENERAL_FOLLOW_UP['en'])}"

    return {
        'language': language,
        'languageName': LANGUAGE_NAMES[language],
        'intent': intent,
        'confidence': round(confidence, 3),
        'title': profile['title'],
        'message': message,
        'advice': {
            'possibleCauses': profile['possible_causes'],
            'summary': profile['summary'],
            'language': language,
            'languageName': LANGUAGE_NAMES[language],
        },
        'precautions': profile['precautions'],
        'nextSteps': profile['next_steps'],
        'urgent': profile['urgent'],
    }