from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from config import Config

cache = Cache()
limiter = Limiter(
    get_remote_address,
    default_limits=Config.RATE_LIMIT_DEFAULT,
    storage_uri=Config.RATE_LIMIT_STORAGE_URI,
)
