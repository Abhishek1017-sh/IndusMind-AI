# Import all the models, so that Base has them before being
# imported by Migrations or Database Initialization script

from app.db.session import Base  # noqa
from app.models.user import User  # noqa
from app.models.document import Document, DocumentChunk  # noqa
from app.models.report import Report  # noqa
from app.models.asset import (  # noqa
    Asset, AssetAlias, AssetMetadata, AssetDocument, Incident, IncidentAsset,
)
