from fastapi import FastAPI


app = FastAPI(
    title="Cadence API",
    version="0.1.0",
)


@app.get("/", tags=["System"])

async def root() -> dict[str, str]:
    return {
        "message": "Cadence API is running",
    }

@app.get("/health", tags=["System"])

async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
    }