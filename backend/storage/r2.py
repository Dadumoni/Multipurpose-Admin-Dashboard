"""
R2 storage client — boto3 with S3-compatible endpoint.
Uploads thumbnails to the 'Thumbnails/' prefix.
"""
import boto3
import logging
import mimetypes
import uuid
from config.settings import settings

logger = logging.getLogger(__name__)

_s3 = None


def get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY,
            aws_secret_access_key=settings.R2_SECRET_KEY,
            region_name="auto",
        )
    return _s3


async def upload_thumbnail(data: bytes, filename: str | None = None, content_type: str = "image/jpeg") -> str:
    """
    Upload raw image bytes to R2 → Thumbnails/.
    Returns the public CDN URL.
    """
    if not filename:
        ext = mimetypes.guess_extension(content_type) or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"

    key = f"Thumbnails/{filename}"

    try:
        get_s3().put_object(
            Bucket=settings.R2_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        public_url = f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"
        logger.info(f"R2 upload OK: {public_url}")
        return public_url
    except Exception as e:
        logger.error(f"R2 upload failed: {e}")
        raise


async def delete_thumbnail(url: str):
    """Delete a thumbnail from R2 given its full public URL."""
    if not url or settings.R2_PUBLIC_URL not in url:
        return
    key = url.replace(settings.R2_PUBLIC_URL.rstrip("/") + "/", "")
    try:
        get_s3().delete_object(Bucket=settings.R2_BUCKET, Key=key)
        logger.info(f"R2 delete OK: {key}")
    except Exception as e:
        logger.warning(f"R2 delete failed ({key}): {e}")
