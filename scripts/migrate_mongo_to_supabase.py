import os
import re
from pymongo import MongoClient
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# =================CONFIGURATION=================
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

MONGO_DB_NAME = "videos_db"
MONGO_COLLECTION_NAME = "posts"
SUPABASE_TABLE_NAME = "viralhub_db"
BATCH_SIZE = 50
FETCH_CHUNK_SIZE = 1000
# ===============================================

def slugify(text: str) -> str:
    """Converts text to clean URL-friendly slug."""
    text = str(text or "").lower()
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'[^a-z0-9\-]', '', text)
    text = re.sub(r'\-+', '-', text)
    return text.strip('-')

def generate_safe_slug(doc: dict) -> str:
    """Title and video_id combination for clean unique slug."""
    title = doc.get("title", "")
    video_id = doc.get("video_id", "")
    combined_text = f"{title}-{video_id}" if video_id else title
    return slugify(combined_text)

def parse_to_unix_seconds(val):
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return val / 1000.0 if val > 1e11 else float(val)
    if isinstance(val, str):
        try:
            num = float(val)
            return num / 1000.0 if num > 1e11 else num
        except ValueError:
            pass
        try:
            from datetime import datetime
            iso_str = val.replace("Z", "+00:00")
            return datetime.fromisoformat(iso_str).timestamp()
        except Exception:
            return None
    return None

def parse_to_unix_ms(val):
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        try:
            return int(float(val))
        except ValueError:
            pass
        try:
            from datetime import datetime
            iso_str = val.replace("Z", "+00:00")
            return int(datetime.fromisoformat(iso_str).timestamp() * 1000)
        except Exception:
            return None
    return None

def init_connections():
    if not MONGO_URI or not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Error: .env file me credentials missing hain! Kripya MONGODB_URI aur VITE_SUPABASE_URL check karein.")
    
    # MongoDB Connect
    mongo_client = MongoClient(MONGO_URI)
    collection = mongo_client[MONGO_DB_NAME][MONGO_COLLECTION_NAME]
    
    # Supabase Connect
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    return collection, supabase, mongo_client

def fetch_existing_supabase_records(supabase: Client):
    """
    Supabase (viralhub_db) se sabhi existing records ke IDs, video_ids, aur post_urls fetch karta hai
    taki wahi data dobara copy na ho.
    """
    print(f"[DB Sync] Supabase ({SUPABASE_TABLE_NAME}) ke existing records check kiye ja rahe hain...")
    existing_ids = set()
    existing_video_ids = set()
    existing_post_urls = set()
    
    from_idx = 0
    while True:
        to_idx = from_idx + FETCH_CHUNK_SIZE - 1
        res = (
            supabase.table(SUPABASE_TABLE_NAME)
            .select("id, video_id, post_url")
            .range(from_idx, to_idx)
            .execute()
        )
        data = res.data or []
        if not data:
            break
            
        for row in data:
            if row.get("id"):
                existing_ids.add(str(row["id"]))
            if row.get("video_id"):
                existing_video_ids.add(str(row["video_id"]))
            if row.get("post_url"):
                existing_post_urls.add(str(row["post_url"]))
                
        if len(data) < FETCH_CHUNK_SIZE:
            break
        from_idx += FETCH_CHUNK_SIZE

    print(f"[DB Sync] Supabase me total {len(existing_ids):,} existing records pehle se maujood hain.")
    return existing_ids, existing_video_ids, existing_post_urls

def migrate_data():
    try:
        collection, supabase, mongo_client = init_connections()
    except Exception as e:
        print(f"[Error] Connection failed: {e}")
        return

    try:
        # Step 1: Pehle Supabase ke existing records fetch karein
        existing_ids, existing_video_ids, existing_post_urls = fetch_existing_supabase_records(supabase)

        # Step 2: MongoDB records scan karein
        total_mongo = collection.count_documents({})
        print(f"[DB Sync] MongoDB ({MONGO_DB_NAME}.{MONGO_COLLECTION_NAME}) me total {total_mongo:,} documents hain.")
        print("[DB Sync] Incremental check shuru ho raha hai: Sirf wahi data copy hoga jo Supabase par nahi hai...\n")

        cursor = collection.find({})
        
        skipped_count = 0
        success_count = 0
        error_count = 0
        pending_batch = []

        def commit_batch(batch):
            nonlocal success_count, error_count
            if not batch:
                return
            try:
                supabase.table(SUPABASE_TABLE_NAME).upsert(batch).execute()
                success_count += len(batch)
                for item in batch:
                    existing_ids.add(item["id"])
                    if item.get("video_id"):
                        existing_video_ids.add(item["video_id"])
                    if item.get("post_url"):
                        existing_post_urls.add(item["post_url"])
                print(f"[Success] Copied batch of {len(batch)} new videos | Total newly copied: {success_count:,}")
            except Exception as e:
                # Batch error fallback: row by row
                print(f"[Warning] Batch upsert warning ({e}). Trying row-by-row...")
                for item in batch:
                    try:
                        supabase.table(SUPABASE_TABLE_NAME).upsert([item]).execute()
                        success_count += 1
                        existing_ids.add(item["id"])
                    except Exception as single_err:
                        error_count += 1
                        print(f"[Error] Failed for ID {item.get('id')}: {single_err}")

        for doc in cursor:
            mongo_id = str(doc.get("_id"))
            video_id = str(doc.get("video_id")) if doc.get("video_id") else None
            post_url = str(doc.get("post_url")) if doc.get("post_url") else None

            # INCREMENTAL CHECK: Agar document pehle se Supabase me hai, toh SKIP karein!
            already_exists = (
                mongo_id in existing_ids or
                (video_id and video_id in existing_video_ids) or
                (post_url and post_url in existing_post_urls)
            )

            if already_exists:
                skipped_count += 1
                continue

            # Naya document format karein
            target_doc = {
                "id": mongo_id,
                "slug": generate_safe_slug(doc),
                "video_id": video_id,
                "title": str(doc.get("title") or "Untitled Video").strip(),
                "post_url": post_url,
                "480p_link": doc.get("480p_link") or doc.get("video_url1") or None,
                "720p_link": doc.get("720p_link") or doc.get("video_url2") or None,
                "domain": doc.get("domain") or None,
                "duration": doc.get("duration") or None,
                "scraped_at": parse_to_unix_seconds(doc.get("scraped_at")) or parse_to_unix_seconds(doc.get("created_at")),
                "thumbnail_url": doc.get("thumbnail_url") or None,
                "views": int(doc.get("views") or 0),
                "updated_at": parse_to_unix_ms(doc.get("updated_at")),
                "site": doc.get("site") or doc.get("domain") or None,
            }

            pending_batch.append(target_doc)

            if len(pending_batch) >= BATCH_SIZE:
                commit_batch(pending_batch)
                pending_batch = []

        # Flush any remaining records
        if pending_batch:
            commit_batch(pending_batch)

        print("\n--- Migration Summary ---")
        print(f"Total in MongoDB: {total_mongo:,}")
        print(f"Already in Supabase (Skipped): {skipped_count:,}")
        print(f"Newly Copied: {success_count:,}")
        print(f"Failed / Errors: {error_count:,}")

        if success_count == 0 and error_count == 0:
            print("[DB Sync] Sabhi MongoDB records pehle se Supabase par up-to-date hain! 0 duplicate copy hui.")

    finally:
        mongo_client.close()

if __name__ == "__main__":
    migrate_data()
