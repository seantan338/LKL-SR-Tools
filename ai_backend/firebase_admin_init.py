import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from logger import setup_logger

logger = setup_logger(__name__)

db = None

def init_firebase():
    global db
    if db is not None:
        return db

    # Check if we already initialized (can happen in dev reloads)
    if not firebase_admin._apps:
        try:
            cred = None
            source_desc = None

            # 1. Check if raw JSON is provided directly via environment variable
            raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            if raw_json and raw_json.strip():
                try:
                    cert_dict = json.loads(raw_json.strip())
                    cred = credentials.Certificate(cert_dict)
                    source_desc = "environment variable FIREBASE_SERVICE_ACCOUNT_JSON"
                except Exception as je:
                    logger.error(f"Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: {je}")

            # 2. Check candidate file paths (including Render Secret Files path)
            if not cred:
                candidate_paths = [
                    os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"),
                    "/etc/secrets/firebase-service-account.json",  # Render Secret Files default path
                    "firebase-service-account.json",
                    os.path.join(os.path.dirname(__file__), "firebase-service-account.json"),
                    os.path.join(os.getcwd(), "firebase-service-account.json"),
                    os.path.join(os.getcwd(), "ai_backend", "firebase-service-account.json")
                ]
                
                for path in candidate_paths:
                    if path and os.path.exists(path):
                        cred = credentials.Certificate(path)
                        source_desc = f"file '{path}'"
                        break

            if not cred:
                logger.warning("Firebase Service Account Key not found (checked FIREBASE_SERVICE_ACCOUNT_JSON, /etc/secrets/firebase-service-account.json, and local files). Firestore sync will be disabled.")
                return None
                
            firebase_admin.initialize_app(cred)
            logger.info(f"Firebase Admin SDK initialized successfully via {source_desc}.")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
            return None
            
    try:
        app_instance = firebase_admin.get_app()
        proj_id = getattr(app_instance, "project_id", None)
        default_db_id = "default" if proj_id == "omnirecruitmanagement" else "(default)"
        target_db_id = (
            os.getenv("FIREBASE_DATABASE_ID")
            or os.getenv("NEXT_PUBLIC_FIREBASE_DATABASE_ID")
            or default_db_id
        ).strip()
        if target_db_id == "(default)":
            db = firestore.client()
            logger.info("Firestore client initialized with standard '(default)' database")
        else:
            db = firestore.client(database_id=target_db_id)
            logger.info(f"Firestore client initialized with named database '{target_db_id}'")
    except TypeError:
        db = firestore.client()
        
    return db

def get_firestore_client():
    return db if db else init_firebase()
