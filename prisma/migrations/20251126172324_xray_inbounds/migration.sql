-- CreateEnum
CREATE TYPE "XrayInboundTypeEnum" AS ENUM ('VLESS', 'TROJAN', 'SHADOWSOCKS');

-- CreateTable
CREATE TABLE "xray_inbounds" (
    "inbound_tag" TEXT NOT NULL,
    "type" "XrayInboundTypeEnum" NOT NULL DEFAULT 'VLESS',

    CONSTRAINT "xray_inbounds_pkey" PRIMARY KEY ("inbound_tag")
);
