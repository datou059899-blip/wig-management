CREATE OR REPLACE FUNCTION public.finalize_product_order_import_v1(
  p_platform text,
  p_shop_key text,
  p_imported_by text,
  p_source_file_name text,
  p_payload jsonb
)
RETURNS TABLE (
  "insertedOrderItems" integer,
  "updatedOrderItems" integer,
  "affectedPerformanceRows" integer,
  "performanceInserted" integer,
  "performanceUpdated" integer,
  "performanceCleared" integer,
  "metaUpdated" boolean,
  "dbExecutionMs" integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_now timestamp := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_fact_count integer;
  v_existing_count integer;
  v_distinct_dedupe_count integer;
  v_affected jsonb := '[]'::jsonb;
  v_aggregates jsonb := '[]'::jsonb;
BEGIN
  IF p_platform IS NULL OR pg_catalog.btrim(p_platform) = ''
    OR p_shop_key IS NULL OR pg_catalog.btrim(p_shop_key) = ''
    OR p_imported_by IS NULL OR pg_catalog.btrim(p_imported_by) = ''
    OR p_payload IS NULL
    OR pg_catalog.jsonb_typeof(p_payload -> 'facts') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(p_payload -> 'skuMap') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid atomic order import input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('order-import:' || p_platform || ':' || p_shop_key, 0)
  );

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT f."dedupeKey")::integer
  INTO v_fact_count, v_distinct_dedupe_count
  FROM pg_catalog.jsonb_to_recordset(p_payload -> 'facts') AS f("dedupeKey" text);

  IF v_fact_count = 0 OR v_fact_count <> v_distinct_dedupe_count THEN
    RAISE EXCEPTION 'Atomic order payload contains no facts or duplicate dedupe keys'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_count
  FROM public."ProductOrderItem" AS poi
  INNER JOIN pg_catalog.jsonb_to_recordset(p_payload -> 'facts') AS f("dedupeKey" text)
    ON f."dedupeKey" = poi."dedupeKey";

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('sku', pairs.sku, 'paidDate', pairs."paidDate")
      ORDER BY pairs."paidDate", pairs.sku
    ),
    '[]'::jsonb
  )
  INTO v_affected
  FROM (
    SELECT DISTINCT
      COALESCE(resolved_product.sku, sku_map."canonicalSku") AS sku,
      poi."paidDate"::date AS "paidDate"
    FROM public."ProductOrderItem" AS poi
    INNER JOIN pg_catalog.jsonb_to_recordset(p_payload -> 'facts') AS f("dedupeKey" text)
      ON f."dedupeKey" = poi."dedupeKey"
    LEFT JOIN public."Product" AS resolved_product
      ON resolved_product.id = poi."resolvedProductId"
    LEFT JOIN pg_catalog.jsonb_to_recordset(p_payload -> 'skuMap') AS sku_map(
      "sourceSku" text,
      "canonicalSku" text
    )
      ON sku_map."sourceSku" = poi."sellerSku"
    WHERE COALESCE(resolved_product.sku, sku_map."canonicalSku") IS NOT NULL

    UNION

    SELECT DISTINCT
      f."canonicalSku" AS sku,
      f."paidDate"::date AS "paidDate"
    FROM pg_catalog.jsonb_to_recordset(p_payload -> 'facts') AS f(
      "canonicalSku" text,
      "paidDate" text,
      "lineClassification" text
    )
    WHERE f."lineClassification" = 'MERCHANDISE'
      AND f."canonicalSku" IS NOT NULL
  ) AS pairs;

  INSERT INTO public."ProductOrderItem" (
    id,
    "dedupeKey",
    "orderId",
    "skuId",
    "tiktokProductId",
    "sellerSku",
    "paidDate",
    "paidTime",
    quantity,
    "returnQty",
    "netQty",
    "canceledQty",
    "stockConsumedQty",
    "isSample",
    "sampleQty",
    "buyerUsername",
    "buyerNickname",
    recipient,
    "refundAmount",
    "skuSubtotalAfterDiscount",
    "orderStatus",
    "cancelationReturnType",
    "productMatched",
    "lineClassification",
    "shopKey",
    "resolvedProductId",
    "sourceFileName",
    "rawPaidTime",
    "createdAt",
    "updatedAt"
  )
  SELECT
    f.id,
    f."dedupeKey",
    f."orderId",
    f."skuId",
    f."tiktokProductId",
    f."sellerSku",
    f."paidDate"::date::timestamp,
    CASE
      WHEN f."paidTime" IS NULL OR f."paidTime" = '' THEN NULL
      ELSE f."paidTime"::timestamptz AT TIME ZONE 'UTC'
    END,
    f.quantity,
    f."returnQty",
    f."netQty",
    f."canceledQty",
    f."stockConsumedQty",
    f."isSample",
    f."sampleQty",
    f."buyerUsername",
    f."buyerNickname",
    f.recipient,
    f."refundAmount",
    f."skuSubtotalAfterDiscount",
    f."orderStatus",
    f."cancelationReturnType",
    f."productMatched",
    f."lineClassification",
    p_shop_key,
    f."resolvedProductId",
    p_source_file_name,
    f."rawPaidTime",
    v_now,
    v_now
  FROM pg_catalog.jsonb_to_recordset(p_payload -> 'facts') AS f(
    id text,
    "dedupeKey" text,
    "orderId" text,
    "skuId" text,
    "tiktokProductId" text,
    "sellerSku" text,
    "paidDate" text,
    "paidTime" text,
    quantity integer,
    "returnQty" integer,
    "netQty" integer,
    "canceledQty" integer,
    "stockConsumedQty" integer,
    "isSample" boolean,
    "sampleQty" integer,
    "buyerUsername" text,
    "buyerNickname" text,
    recipient text,
    "refundAmount" double precision,
    "skuSubtotalAfterDiscount" numeric(18, 2),
    "orderStatus" text,
    "cancelationReturnType" text,
    "productMatched" boolean,
    "lineClassification" text,
    "resolvedProductId" text,
    "rawPaidTime" text
  )
  ON CONFLICT ("dedupeKey") DO UPDATE SET
    "orderId" = EXCLUDED."orderId",
    "skuId" = EXCLUDED."skuId",
    "tiktokProductId" = EXCLUDED."tiktokProductId",
    "sellerSku" = EXCLUDED."sellerSku",
    "paidDate" = EXCLUDED."paidDate",
    "paidTime" = EXCLUDED."paidTime",
    quantity = EXCLUDED.quantity,
    "returnQty" = EXCLUDED."returnQty",
    "netQty" = EXCLUDED."netQty",
    "canceledQty" = EXCLUDED."canceledQty",
    "stockConsumedQty" = EXCLUDED."stockConsumedQty",
    "isSample" = EXCLUDED."isSample",
    "sampleQty" = EXCLUDED."sampleQty",
    "buyerUsername" = EXCLUDED."buyerUsername",
    "buyerNickname" = EXCLUDED."buyerNickname",
    recipient = EXCLUDED.recipient,
    "refundAmount" = EXCLUDED."refundAmount",
    "skuSubtotalAfterDiscount" = EXCLUDED."skuSubtotalAfterDiscount",
    "orderStatus" = EXCLUDED."orderStatus",
    "cancelationReturnType" = EXCLUDED."cancelationReturnType",
    "productMatched" = EXCLUDED."productMatched",
    "lineClassification" = EXCLUDED."lineClassification",
    "shopKey" = EXCLUDED."shopKey",
    "resolvedProductId" = EXCLUDED."resolvedProductId",
    "sourceFileName" = EXCLUDED."sourceFileName",
    "rawPaidTime" = EXCLUDED."rawPaidTime",
    "updatedAt" = v_now;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sku', aggregated.sku,
        'paidDate', aggregated."paidDate",
        'productName', aggregated."productName",
        'grossOrders', aggregated."grossOrders",
        'returnQty', aggregated."returnQty",
        'netOrders', aggregated."netOrders",
        'canceledQty', aggregated."canceledQty",
        'stockConsumedQty', aggregated."stockConsumedQty",
        'sampleQty', aggregated."sampleQty",
        'refundAmount', aggregated."refundAmount",
        'merchandiseAmount', aggregated."merchandiseAmount"
      )
      ORDER BY aggregated."paidDate", aggregated.sku
    ),
    '[]'::jsonb
  )
  INTO v_aggregates
  FROM (
    SELECT
      COALESCE(resolved_product.sku, sku_map."canonicalSku") AS sku,
      poi."paidDate"::date AS "paidDate",
      canonical_product.name AS "productName",
      pg_catalog.sum(CASE WHEN poi."isSample" THEN 0 ELSE poi.quantity END)::integer AS "grossOrders",
      pg_catalog.sum(poi."returnQty")::integer AS "returnQty",
      pg_catalog.sum(poi."netQty")::integer AS "netOrders",
      pg_catalog.sum(poi."canceledQty")::integer AS "canceledQty",
      pg_catalog.sum(poi."stockConsumedQty")::integer AS "stockConsumedQty",
      pg_catalog.sum(poi."sampleQty")::integer AS "sampleQty",
      pg_catalog.sum(poi."refundAmount")::double precision AS "refundAmount",
      CASE
        WHEN pg_catalog.count(*) FILTER (WHERE poi."skuSubtotalAfterDiscount" IS NULL) > 0 THEN NULL
        ELSE COALESCE(pg_catalog.sum(poi."skuSubtotalAfterDiscount"), 0::numeric)
      END AS "merchandiseAmount"
    FROM public."ProductOrderItem" AS poi
    LEFT JOIN public."Product" AS resolved_product
      ON resolved_product.id = poi."resolvedProductId"
    LEFT JOIN pg_catalog.jsonb_to_recordset(p_payload -> 'skuMap') AS sku_map(
      "sourceSku" text,
      "canonicalSku" text
    )
      ON sku_map."sourceSku" = poi."sellerSku"
    INNER JOIN pg_catalog.jsonb_to_recordset(v_affected) AS affected(
      sku text,
      "paidDate" date
    )
      ON affected.sku = COALESCE(resolved_product.sku, sku_map."canonicalSku")
     AND affected."paidDate" = poi."paidDate"::date
    LEFT JOIN public."Product" AS canonical_product
      ON canonical_product.sku = COALESCE(resolved_product.sku, sku_map."canonicalSku")
    WHERE poi."productMatched" = true
      AND poi."lineClassification" IS DISTINCT FROM 'NON_MERCHANDISE_GIFT'
    GROUP BY
      COALESCE(resolved_product.sku, sku_map."canonicalSku"),
      poi."paidDate"::date,
      canonical_product.name
  ) AS aggregated;

  SELECT
    pg_catalog.count(*) FILTER (WHERE pd.id IS NULL)::integer,
    pg_catalog.count(*) FILTER (WHERE pd.id IS NOT NULL)::integer
  INTO "performanceInserted", "performanceUpdated"
  FROM pg_catalog.jsonb_to_recordset(v_aggregates) AS aggregated(
    sku text,
    "paidDate" date
  )
  LEFT JOIN public."PerformanceDaily" AS pd
    ON pd.sku = aggregated.sku
   AND pd.date::date = aggregated."paidDate";

  INSERT INTO public."PerformanceDaily" (
    id,
    date,
    sku,
    "productName",
    orders,
    "grossOrders",
    "returnQty",
    "netOrders",
    "canceledQty",
    "stockConsumedQty",
    "sampleQty",
    "refundAmount",
    "merchandiseAmount",
    "createdAt",
    "updatedAt"
  )
  SELECT
    pg_catalog.gen_random_uuid()::text,
    aggregated."paidDate"::timestamp,
    aggregated.sku,
    aggregated."productName",
    aggregated."netOrders",
    aggregated."grossOrders",
    aggregated."returnQty",
    aggregated."netOrders",
    aggregated."canceledQty",
    aggregated."stockConsumedQty",
    aggregated."sampleQty",
    aggregated."refundAmount",
    aggregated."merchandiseAmount",
    v_now,
    v_now
  FROM pg_catalog.jsonb_to_recordset(v_aggregates) AS aggregated(
    sku text,
    "paidDate" date,
    "productName" text,
    "grossOrders" integer,
    "returnQty" integer,
    "netOrders" integer,
    "canceledQty" integer,
    "stockConsumedQty" integer,
    "sampleQty" integer,
    "refundAmount" double precision,
    "merchandiseAmount" numeric(18, 2)
  )
  ON CONFLICT (date, sku) DO UPDATE SET
    "productName" = EXCLUDED."productName",
    orders = EXCLUDED.orders,
    "grossOrders" = EXCLUDED."grossOrders",
    "returnQty" = EXCLUDED."returnQty",
    "netOrders" = EXCLUDED."netOrders",
    "canceledQty" = EXCLUDED."canceledQty",
    "stockConsumedQty" = EXCLUDED."stockConsumedQty",
    "sampleQty" = EXCLUDED."sampleQty",
    "refundAmount" = EXCLUDED."refundAmount",
    "merchandiseAmount" = EXCLUDED."merchandiseAmount",
    "updatedAt" = v_now;

  UPDATE public."PerformanceDaily" AS pd
  SET
    orders = 0,
    "grossOrders" = 0,
    "returnQty" = 0,
    "netOrders" = 0,
    "canceledQty" = 0,
    "stockConsumedQty" = 0,
    "sampleQty" = 0,
    "refundAmount" = 0,
    "merchandiseAmount" = NULL,
    "updatedAt" = v_now
  FROM pg_catalog.jsonb_to_recordset(v_affected) AS affected(
    sku text,
    "paidDate" date
  )
  WHERE pd.sku = affected.sku
    AND pd.date::date = affected."paidDate"
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_to_recordset(v_aggregates) AS aggregated(
        sku text,
        "paidDate" date
      )
      WHERE aggregated.sku = affected.sku
        AND aggregated."paidDate" = affected."paidDate"
    );
  GET DIAGNOSTICS "performanceCleared" = ROW_COUNT;

  INSERT INTO public."PerformanceMeta" (
    id,
    "lastOrdersImportAt",
    "lastImportedBy",
    "createdAt",
    "updatedAt"
  )
  VALUES ('singleton', v_now, p_imported_by, v_now, v_now)
  ON CONFLICT (id) DO UPDATE SET
    "lastOrdersImportAt" = EXCLUDED."lastOrdersImportAt",
    "lastImportedBy" = EXCLUDED."lastImportedBy",
    "updatedAt" = v_now;

  "insertedOrderItems" := v_fact_count - v_existing_count;
  "updatedOrderItems" := v_existing_count;
  "affectedPerformanceRows" := pg_catalog.jsonb_array_length(v_affected);
  "metaUpdated" := true;
  "dbExecutionMs" := pg_catalog.floor(
    EXTRACT(epoch FROM (pg_catalog.clock_timestamp() - v_started_at)) * 1000
  )::integer;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_product_order_import_v1(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_product_order_import_v1(text, text, text, text, jsonb) TO postgres;
