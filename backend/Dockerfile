# Self-hosting image for the API.
#
# Unlike the Vercel deployment, a container CAN reach a host-local Ollama, so this
# is the path if you want real answers with no API key and no per-token cost.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, so a source change does not invalidate the install layer.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY neura ./neura

EXPOSE 8001

# Run as a non-root user.
RUN useradd --create-home --uid 10001 neura && chown -R neura:neura /app
USER neura

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/api/health', timeout=4).status==200 else 1)"

CMD ["uvicorn", "neura.main:app", "--host", "0.0.0.0", "--port", "8001"]
