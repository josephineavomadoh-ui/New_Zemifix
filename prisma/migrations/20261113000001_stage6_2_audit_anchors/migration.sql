-- CreateTable
CREATE TABLE "audit_anchors" (
    "anchorDate" DATE NOT NULL,
    "sequenceNumber" BIGINT NOT NULL,
    "headHash" VARCHAR(64) NOT NULL,
    "entryCount" BIGINT NOT NULL,
    "anchorSignature" VARCHAR(128) NOT NULL,
    "anchoredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_anchors_pkey" PRIMARY KEY ("anchorDate")
);
