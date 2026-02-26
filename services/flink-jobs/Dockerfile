FROM flink:1.18-java11

# Install Python and PyFlink
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    python3 -m pip install --no-cache-dir --break-system-packages \
        apache-flink==1.18.1 \
        apache-flink-libraries==1.18.1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/flink-jobs
COPY market_processor.py .

# Wait for Flink JobManager to be ready, then submit the job
CMD ["sh", "-c", "echo 'Waiting for Flink JobManager...' && sleep 30 && python3 /opt/flink-jobs/market_processor.py"]
