"""סכמות Pydantic לשאלות לבירור."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QuestionStatus = Literal["open", "answered"]


class QuestionCreate(BaseModel):
    page: str = ""
    question_text: str = Field(min_length=1)
    screenshot_data: str = ""


class QuestionUpdate(BaseModel):
    status: QuestionStatus | None = None
    answer: str | None = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    page: str
    question_text: str
    screenshot_data: str
    status: QuestionStatus
    answer: str
    created_at: datetime
