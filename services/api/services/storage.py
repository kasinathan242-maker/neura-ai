"""NEURA AI — Object Storage Service (services/api/services/storage.py).

Provides unified object storage for uploaded PDFs and study materials.
Connects to MinIO S3 object storage with a resilient local disk fallback for
development and hermetic testing environments.
"""

import io
import logging
import os
from pathlib import Path

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_LIB_AVAILABLE = True
except ImportError:
    MINIO_LIB_AVAILABLE = False
    S3Error = Exception  # type: ignore

try:
    from services.api.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("neura.storage")


class StorageService:
    """Manages document uploads and retrievals with MinIO and disk fallback."""

    def __init__(self) -> None:
        self.bucket = settings.MINIO_DOCUMENTS_BUCKET
        self.client: Minio | None = None
        self.local_storage_dir = Path("data/storage").resolve()
        self.local_storage_dir.mkdir(parents=True, exist_ok=True)
        self._init_client()

    def _init_client(self) -> None:
        """Initializes MinIO client if library and connection are available."""
        if not MINIO_LIB_AVAILABLE or settings.ENVIRONMENT == "testing":
            logger.info("Testing environment or MinIO library not present; using local filesystem storage.")
            return

        try:
            client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ROOT_USER,
                secret_key=settings.MINIO_ROOT_PASSWORD,
                secure=settings.MINIO_USE_SSL,
            )
            # Quick probe check
            if not client.bucket_exists(self.bucket):
                client.make_bucket(self.bucket)
            self.client = client
            logger.info(f"Connected to MinIO at {settings.MINIO_ENDPOINT}, bucket '{self.bucket}' ready.")
        except Exception as exc:
            logger.warning(
                f"MinIO storage unreachable at {settings.MINIO_ENDPOINT} ({exc}). "
                f"Using local filesystem fallback at {self.local_storage_dir}."
            )
            self.client = None

    def upload_bytes(
        self,
        object_name: str,
        data: bytes,
        content_type: str = "application/pdf",
        bucket: str | None = None,
    ) -> str:
        """Uploads raw bytes to MinIO or local storage fallback."""
        target_bucket = bucket or self.bucket

        if self.client:
            try:
                stream = io.BytesIO(data)
                self.client.put_object(
                    bucket_name=target_bucket,
                    object_name=object_name,
                    data=stream,
                    length=len(data),
                    content_type=content_type,
                )
                logger.info(f"Stored {len(data)} bytes in MinIO: {target_bucket}/{object_name}")
                return f"{target_bucket}/{object_name}"
            except Exception as exc:
                logger.warning(f"MinIO upload error ({exc}); falling back to local disk.")

        # Local disk fallback
        local_path = self.local_storage_dir / target_bucket / object_name
        local_path.parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)

        logger.info(f"Stored {len(data)} bytes on local disk: {local_path}")
        return f"{target_bucket}/{object_name}"

    def get_bytes(self, object_name: str, bucket: str | None = None) -> bytes:
        """Retrieves raw bytes from MinIO or local storage fallback."""
        target_bucket = bucket or self.bucket

        if self.client:
            try:
                response = self.client.get_object(target_bucket, object_name)
                try:
                    return response.read()
                finally:
                    response.close()
                    response.release_conn()
            except Exception as exc:
                logger.debug(f"MinIO get_object note: {exc}; checking local disk.")

        local_path = self.local_storage_dir / target_bucket / object_name
        if local_path.exists():
            with open(local_path, "rb") as f:
                return f.read()

        raise FileNotFoundError(f"Object {target_bucket}/{object_name} not found in storage.")

    def delete_object(self, object_name: str, bucket: str | None = None) -> bool:
        """Deletes object from MinIO and local disk."""
        target_bucket = bucket or self.bucket
        deleted = False

        if self.client:
            try:
                self.client.remove_object(target_bucket, object_name)
                deleted = True
            except Exception as exc:
                logger.debug(f"MinIO remove_object note: {exc}")

        local_path = self.local_storage_dir / target_bucket / object_name
        if local_path.exists():
            try:
                os.remove(local_path)
                deleted = True
            except OSError:
                pass

        return deleted


storage_service = StorageService()
