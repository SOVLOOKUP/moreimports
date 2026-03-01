# moreimports

moreimports is a Bun plugin that enables protocol-based module imports for remote and storage-backed resources.

It provides:

- Native URL-like import experience for OpenDAL service protocols.
- Built-in protocol registration through `ProtocolLoader`.
- Utility helpers such as `newURL`, `encodeOptions`, and `decodeOptions`.

Use this plugin when you want to import modules from custom protocol sources with a consistent developer experience.

<!-- AUTO-GENERATED-IMPORTS:START -->
## Available Protocol Modules (Auto-generated)

This project currently supports **61** protocol modules that can be imported directly.

Preview: `aliyun-drive`, `alluxio`, `azblob`, `azdls`, `azfile`, `b2`, `cacache`, `cloudflare-kv`, `compfs`, `cos`, `d1`, `dashmap` ...

### Quick Start

Use `newURL` first to build a module specifier (options are encoded automatically).

### Import Examples

```ts
import { newURL } from "moreimports";

const specifier = newURL("s3", {
  bucket: "my-bucket",
  region: "ap-southeast-1",
  access_key_id: "<your-access-key>",
  secret_access_key: "<your-secret-key>",
}, "index.ts");

const mod = await import(specifier);
```

You can also import with a direct protocol URL:

```ts
import customModule from "<schema>://<base64-options>/path/to/module.js";

import s3Module from "s3://<base64-options>/path/to/module.js";
import fsModule from "fs://<base64-options>/path/to/module.js";
import httpModule from "http://<base64-options>/path/to/module.js";
```

<details>
<summary>View all available protocols (grouped by initial)</summary>

- **A**: `aliyun-drive` · `alluxio` · `azblob` · `azdls` · `azfile`
- **B**: `b2`
- **C**: `cacache` · `cloudflare-kv` · `compfs` · `cos`
- **D**: `d1` · `dashmap` · `dbfs` · `dropbox`
- **E**: `etcd`
- **F**: `foundationdb` · `fs` · `ftp`
- **G**: `gcs` · `gdrive` · `ghac` · `github` · `gridfs`
- **H**: `hdfs` · `hdfs-native` · `http` · `huggingface`
- **I**: `ipfs` · `ipmfs`
- **K**: `koofr`
- **L**: `lakefs`
- **M**: `memcached` · `memory` · `mini-moka` · `moka` · `mongodb` · `monoiofs` · `mysql`
- **O**: `obs` · `onedrive` · `oss`
- **P**: `pcloud` · `persy` · `postgresql`
- **R**: `redb` · `redis` · `rocksdb`
- **S**: `s3` · `seafile` · `sftp` · `sled` · `sqlite` · `surrealdb` · `swift`
- **T**: `tikv`
- **U**: `upyun`
- **V**: `vercel-artifacts` · `vercel-blob`
- **W**: `webdav` · `webhdfs`
- **Y**: `yandex-disk`

</details>
<!-- AUTO-GENERATED-IMPORTS:END -->
