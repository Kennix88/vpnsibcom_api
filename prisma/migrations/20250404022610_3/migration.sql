-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CurrencyEnum" ADD VALUE 'AED';
ALTER TYPE "CurrencyEnum" ADD VALUE 'ARS';
ALTER TYPE "CurrencyEnum" ADD VALUE 'AUD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'AZN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'AMD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BDT';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BYN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BGN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BHD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BOB';
ALTER TYPE "CurrencyEnum" ADD VALUE 'BRL';
ALTER TYPE "CurrencyEnum" ADD VALUE 'CAD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'CHF';
ALTER TYPE "CurrencyEnum" ADD VALUE 'CNY';
ALTER TYPE "CurrencyEnum" ADD VALUE 'COP';
ALTER TYPE "CurrencyEnum" ADD VALUE 'CZK';
ALTER TYPE "CurrencyEnum" ADD VALUE 'DKK';
ALTER TYPE "CurrencyEnum" ADD VALUE 'EGP';
ALTER TYPE "CurrencyEnum" ADD VALUE 'GBP';
ALTER TYPE "CurrencyEnum" ADD VALUE 'HKD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'HUF';
ALTER TYPE "CurrencyEnum" ADD VALUE 'INR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'IDR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'JPY';
ALTER TYPE "CurrencyEnum" ADD VALUE 'KES';
ALTER TYPE "CurrencyEnum" ADD VALUE 'KWD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'MAD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'MNT';
ALTER TYPE "CurrencyEnum" ADD VALUE 'MXN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'NGN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'NZD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'OMR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'PEN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'PHP';
ALTER TYPE "CurrencyEnum" ADD VALUE 'PKR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'PLN';
ALTER TYPE "CurrencyEnum" ADD VALUE 'QAR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'RON';
ALTER TYPE "CurrencyEnum" ADD VALUE 'SAR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'SEK';
ALTER TYPE "CurrencyEnum" ADD VALUE 'THB';
ALTER TYPE "CurrencyEnum" ADD VALUE 'TRY';
ALTER TYPE "CurrencyEnum" ADD VALUE 'TWD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'UAH';
ALTER TYPE "CurrencyEnum" ADD VALUE 'UGX';
ALTER TYPE "CurrencyEnum" ADD VALUE 'VND';
ALTER TYPE "CurrencyEnum" ADD VALUE 'ZAR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'GEL';
ALTER TYPE "CurrencyEnum" ADD VALUE 'KGS';
ALTER TYPE "CurrencyEnum" ADD VALUE 'MDL';
ALTER TYPE "CurrencyEnum" ADD VALUE 'NOK';
ALTER TYPE "CurrencyEnum" ADD VALUE 'XDR';
ALTER TYPE "CurrencyEnum" ADD VALUE 'SGD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'TJS';
ALTER TYPE "CurrencyEnum" ADD VALUE 'TMT';
ALTER TYPE "CurrencyEnum" ADD VALUE 'UZS';
ALTER TYPE "CurrencyEnum" ADD VALUE 'RSD';
ALTER TYPE "CurrencyEnum" ADD VALUE 'KRW';
