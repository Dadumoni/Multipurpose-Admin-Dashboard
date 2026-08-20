"""
Unique slug generator.
Format: letters + digits + underscore, 15–20 chars.
Derived from title when available; always suffixed with random chars for uniqueness.
"""
import random
import string
import re
import unicodedata


_SAFE = string.ascii_lowercase + string.digits + "_"
_RAND_CHARS = string.ascii_lowercase + string.digits


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode()
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text


def generate_slug(title: str | None = None, length: int | None = None) -> str:
    """
    Generate a unique slug 15–20 characters long.
    If title provided, use its cleaned prefix; pad/truncate and add random suffix.
    """
    target_len = length or random.randint(15, 20)
    suffix_len = random.randint(4, 6)
    suffix = "".join(random.choices(_RAND_CHARS, k=suffix_len))

    if title:
        prefix = _normalize(title)
        # Max prefix length leaves room for _ + suffix
        max_prefix = target_len - suffix_len - 1
        prefix = prefix[:max_prefix] if len(prefix) > max_prefix else prefix
        slug = f"{prefix}_{suffix}" if prefix else suffix
    else:
        base_len = target_len - suffix_len
        base = "".join(random.choices(_RAND_CHARS, k=base_len))
        slug = base + suffix

    # Ensure total length in 15–20
    if len(slug) < 15:
        slug += "".join(random.choices(_RAND_CHARS, k=15 - len(slug)))
    elif len(slug) > 20:
        slug = slug[:20]

    return slug
