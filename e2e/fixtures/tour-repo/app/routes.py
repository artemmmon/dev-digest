from fastapi import APIRouter

router = APIRouter()

ITEMS = [{"id": 1, "name": "first"}, {"id": 2, "name": "second"}]


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/items")
def list_items() -> list[dict]:
    return ITEMS
