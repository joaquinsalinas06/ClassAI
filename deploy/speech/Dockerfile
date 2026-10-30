FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
WORKDIR /speech
COPY deploy/speech/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY deploy/speech/service.py ./
USER 10001:10001
CMD ["python", "service.py"]
