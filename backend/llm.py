"""
LLM layer — Claude API wrapper for extraction, translation, and narration.
Falls back to regex if API unavailable.
"""

import os
import json
import re
from typing import Optional

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            import anthropic
            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                return None
            _client = anthropic.Anthropic(api_key=key)
        except Exception:
            return None
    return _client


def call_claude(
    system: str,
    user_prompt: str,
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4096,
    temperature: float = 0.0,
) -> Optional[str]:
    """Call Claude API. Returns response text or None on failure."""
    client = _get_client()
    if not client:
        return None
    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text
    except Exception as e:
        print(f"[LLM] Claude API error: {e}")
        return None


def call_claude_json(
    system: str,
    user_prompt: str,
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4096,
) -> Optional[dict]:
    """Call Claude and parse JSON from response. Returns None on failure."""
    raw = call_claude(system, user_prompt, model=model, max_tokens=max_tokens)
    if not raw:
        return None
    try:
        # Extract JSON from response (might be wrapped in ```json ... ```)
        json_match = re.search(r'```json\s*(.*?)\s*```', raw, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        # Try parsing the whole response as JSON
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        # Try to find any JSON object in the response
        brace_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass
        return None


def is_available() -> bool:
    """Check if Claude API is available."""
    return _get_client() is not None
