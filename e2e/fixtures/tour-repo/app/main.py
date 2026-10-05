from fastapi import FastAPI

from app.routes import router

app = FastAPI(title="tour-sample")
app.include_router(router)
