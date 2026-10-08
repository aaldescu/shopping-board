/// <reference path="../pb_data/types.d.ts" />

// Configures PocketBase's built-in backups from environment variables on
// every boot.
//
// Why env vars instead of the admin UI: backup settings normally live in the
// database, which lives in the very volume we're protecting. If the server or
// volume is destroyed, a fresh deploy would come back with backups silently
// switched off. Driving the config from Dokploy's Environment tab means a
// rebuilt server starts backing itself up again immediately.
//
//   BACKUP_CRON          cron schedule, e.g. "0 3 * * *" (empty = disabled)
//   BACKUP_MAX_KEEP      how many auto backups to keep on disk (default 7)
//   BACKUP_S3_ENABLED    "true" to upload backups to S3-compatible storage
//   BACKUP_S3_BUCKET     bucket name
//   BACKUP_S3_REGION     region (e.g. "auto" for Cloudflare R2)
//   BACKUP_S3_ENDPOINT   e.g. "<account>.r2.cloudflarestorage.com"
//   BACKUP_S3_ACCESS_KEY access key id
//   BACKUP_S3_SECRET     secret access key
//   BACKUP_S3_PATH_STYLE "true" for MinIO / some S3-compatible providers

onBootstrap((e) => {
  // The app must finish booting before its settings can be read or saved.
  e.next();

  try {
    const env = (k) => ($os.getenv(k) || "").trim();
    const isOn = (v) => /^(1|true|yes|on)$/i.test(v);

    const cron = env("BACKUP_CRON");
    const s3On = isOn(env("BACKUP_S3_ENABLED"));

    // Nothing configured -> leave whatever is set in the admin UI untouched.
    if (!cron && !s3On) {
      return;
    }

    const settings = e.app.settings();

    if (cron) {
      settings.backups.cron = cron;
      const keep = parseInt(env("BACKUP_MAX_KEEP"), 10);
      settings.backups.cronMaxKeep = keep > 0 ? keep : 7;
    }

    if (s3On) {
      settings.backups.s3.enabled = true;
      settings.backups.s3.bucket = env("BACKUP_S3_BUCKET");
      settings.backups.s3.region = env("BACKUP_S3_REGION") || "auto";
      settings.backups.s3.endpoint = env("BACKUP_S3_ENDPOINT");
      settings.backups.s3.accessKey = env("BACKUP_S3_ACCESS_KEY");
      settings.backups.s3.secret = env("BACKUP_S3_SECRET");
      settings.backups.s3.forcePathStyle = isOn(env("BACKUP_S3_PATH_STYLE"));
    }

    e.app.save(settings);

    e.app.logger().info(
      "backups configured from env",
      "cron", cron || "(unchanged)",
      "maxKeep", settings.backups.cronMaxKeep,
      "s3", s3On ? settings.backups.s3.bucket : "off"
    );
  } catch (err) {
    // Never let a bad backup config stop the app from starting.
    e.app.logger().error("backup config failed", "error", String(err));
  }
});
