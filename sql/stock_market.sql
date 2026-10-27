-- Full-market daily data and immutable screening results. No existing tables are removed.
CREATE TABLE IF NOT EXISTS stock_market_security (
  symbol VARCHAR(8) NOT NULL PRIMARY KEY,
  code VARCHAR(6) NOT NULL,
  exchange VARCHAR(2) NOT NULL,
  name VARCHAR(80) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  first_seen_date DATE NOT NULL,
  last_seen_date DATE NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_market_sync_run (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  trade_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL,
  expected_count INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  source VARCHAR(160) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3),
  error_message VARCHAR(2000),
  UNIQUE KEY uk_market_sync_run(run_id),
  KEY idx_market_sync_date(trade_date,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_market_sync_item (
  run_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(8) NOT NULL,
  name VARCHAR(80) NOT NULL,
  exchange VARCHAR(2) NOT NULL,
  status VARCHAR(16) NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  last_bar_date DATE,
  error_message VARCHAR(1000),
  PRIMARY KEY(run_id,symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_market_daily (
  symbol VARCHAR(8) NOT NULL,
  trade_date DATE NOT NULL,
  raw_open DECIMAL(20,6) NOT NULL,
  raw_high DECIMAL(20,6) NOT NULL,
  raw_low DECIMAL(20,6) NOT NULL,
  raw_close DECIMAL(20,6) NOT NULL,
  qfq_open DECIMAL(20,6) NOT NULL,
  qfq_high DECIMAL(20,6) NOT NULL,
  qfq_low DECIMAL(20,6) NOT NULL,
  qfq_close DECIMAL(20,6) NOT NULL,
  volume_shares BIGINT UNSIGNED NOT NULL,
  qfq_as_of_date DATE NOT NULL,
  last_sync_id VARCHAR(64) NOT NULL,
  fetched_at DATETIME(3) NOT NULL,
  PRIMARY KEY(symbol,trade_date),
  KEY idx_market_daily_date(trade_date),
  KEY idx_market_daily_sync(last_sync_id,symbol,trade_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_screen_run (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  snapshot_id VARCHAR(120) NOT NULL,
  sync_run_id VARCHAR(64) NOT NULL,
  trade_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL,
  engine_sha256 VARCHAR(64) NOT NULL,
  universe_count INT NOT NULL DEFAULT 0,
  analyzed_count INT NOT NULL DEFAULT 0,
  excluded_count INT NOT NULL DEFAULT 0,
  uptrend_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  matched_st_count INT NOT NULL DEFAULT 0,
  golden_count INT NOT NULL DEFAULT 0,
  retrace_count INT NOT NULL DEFAULT 0,
  convergence_count INT NOT NULL DEFAULT 0,
  exclusion_counts LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3),
  error_message VARCHAR(2000),
  UNIQUE KEY uk_stock_screen_snapshot(snapshot_id),
  KEY idx_stock_screen_latest(status,trade_date,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_screen_result (
  snapshot_id VARCHAR(120) NOT NULL,
  symbol VARCHAR(8) NOT NULL,
  name VARCHAR(80) NOT NULL,
  exchange VARCHAR(2) NOT NULL,
  is_st TINYINT NOT NULL,
  result_status VARCHAR(16) NOT NULL,
  reason_code VARCHAR(64),
  golden_cross TINYINT NOT NULL DEFAULT 0,
  retrace TINYINT NOT NULL DEFAULT 0,
  convergence TINYINT NOT NULL DEFAULT 0,
  result_json LONGTEXT NOT NULL,
  PRIMARY KEY(snapshot_id,symbol),
  KEY idx_stock_screen_candidates(snapshot_id,result_status,exchange)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
