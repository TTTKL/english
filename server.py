import json
import sqlite3
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "lexisprint.db"
DEFAULT_IMPORT_PATH = Path(r"D:\qq_down\down\1521164661106_KaoYanluan_1\KaoYanluan_1.json")
DEFAULT_SETTINGS = {
    "exam": "cet4",
    "generatorMode": "demo",
    "apiBase": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4o-mini",
    "outputType": "sentence",
    "roundSize": "8",
}


def now_ms() -> int:
    return int(time.time() * 1000)


def today_key() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db_connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS words (
                id TEXT PRIMARY KEY,
                word TEXT NOT NULL UNIQUE,
                meaning TEXT NOT NULL,
                tag TEXT DEFAULT '',
                source TEXT DEFAULT 'manual',
                source_ref TEXT DEFAULT '',
                rank_num INTEGER,
                example_sentence TEXT DEFAULT '',
                example_cn TEXT DEFAULT '',
                raw_json TEXT DEFAULT '',
                familiarity INTEGER NOT NULL DEFAULT 0,
                review_count INTEGER NOT NULL DEFAULT 0,
                next_due_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                last_reviewed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS study_logs (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                word_id TEXT NOT NULL,
                word TEXT NOT NULL,
                meaning TEXT NOT NULL,
                rating TEXT NOT NULL,
                familiarity_after INTEGER NOT NULL,
                reviewed_at INTEGER NOT NULL,
                FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )

        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )

        conn.commit()
    finally:
        conn.close()


def row_to_word(row: sqlite3.Row) -> dict:
    synonyms = []
    raw_json = row["raw_json"] or ""
    if raw_json:
        try:
            entry = json.loads(raw_json)
            synos = (
                entry.get("content", {})
                .get("word", {})
                .get("content", {})
                .get("syno", {})
                .get("synos", [])
            )
            for item in synos:
                tran = str(item.get("tran", "")).strip()
                hwds = item.get("hwds", [])
                english = str(hwds[0].get("w", "")).strip() if hwds else ""
                label = english or tran
                if tran and english:
                    label = f"{english} · {tran}"
                if label:
                    synonyms.append(label)
        except (json.JSONDecodeError, AttributeError, IndexError, TypeError):
            synonyms = []

    return {
        "id": row["id"],
        "word": row["word"],
        "meaning": row["meaning"],
        "tag": row["tag"],
        "source": row["source"],
        "sourceRef": row["source_ref"],
        "rank": row["rank_num"],
        "exampleSentence": row["example_sentence"],
        "exampleCn": row["example_cn"],
        "synonyms": synonyms,
        "familiarity": row["familiarity"],
        "reviewCount": row["review_count"],
        "nextDueAt": row["next_due_at"],
        "createdAt": row["created_at"],
        "lastReviewedAt": row["last_reviewed_at"],
    }


def get_settings(conn: sqlite3.Connection) -> dict:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = DEFAULT_SETTINGS.copy()
    settings.update({row["key"]: row["value"] for row in rows})
    return settings


def get_today_log(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, date, word_id, word, meaning, rating, familiarity_after, reviewed_at
        FROM study_logs
        WHERE date = ?
        ORDER BY reviewed_at DESC
        """,
        (today_key(),),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "date": row["date"],
            "wordId": row["word_id"],
            "word": row["word"],
            "meaning": row["meaning"],
            "rating": row["rating"],
            "familiarityAfter": row["familiarity_after"],
            "reviewedAt": row["reviewed_at"],
        }
        for row in rows
    ]


def get_library_meta(conn: sqlite3.Connection) -> dict:
    total = conn.execute("SELECT COUNT(*) AS count FROM words").fetchone()["count"]
    if total == 0:
        return {
            "totalWords": 0,
            "boundExam": None,
            "sourceLabel": "",
        }

    kaoyan_count = conn.execute(
        "SELECT COUNT(*) AS count FROM words WHERE source = 'kaoyan_json'"
    ).fetchone()["count"]

    if kaoyan_count == total:
        return {
            "totalWords": total,
            "boundExam": "kaoyan",
            "sourceLabel": "考研词汇",
        }

    return {
        "totalWords": total,
        "boundExam": None,
        "sourceLabel": "混合词库",
    }


def get_state() -> dict:
    conn = db_connect()
    try:
        words = conn.execute(
            """
            SELECT *
            FROM words
            ORDER BY created_at DESC, word ASC
            """
        ).fetchall()
        return {
            "words": [row_to_word(row) for row in words],
            "todayLog": get_today_log(conn),
            "settings": get_settings(conn),
            "libraryMeta": get_library_meta(conn),
        }
    finally:
        conn.close()


def parse_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8"))


def json_response(handler: SimpleHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def text_response(handler: SimpleHTTPRequestHandler, message: str, status: int = 400) -> None:
    data = message.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def create_word(payload: dict) -> dict:
    word = str(payload.get("word", "")).strip().lower()
    meaning = str(payload.get("meaning", "")).strip()
    tag = str(payload.get("tag", "")).strip()

    if not word or not meaning:
        raise ValueError("word 和 meaning 不能为空。")

    conn = db_connect()
    try:
        current = now_ms()
        item_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO words (
                id, word, meaning, tag, source, source_ref, rank_num,
                example_sentence, example_cn, raw_json, familiarity,
                review_count, next_due_at, created_at, last_reviewed_at
            )
            VALUES (?, ?, ?, ?, 'manual', '', NULL, '', '', '', 0, 0, ?, ?, NULL)
            """,
            (item_id, word, meaning, tag, current, current),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM words WHERE id = ?", (item_id,)).fetchone()
        return row_to_word(row)
    except sqlite3.IntegrityError as exc:
        raise ValueError("这个单词已经在词库里了。") from exc
    finally:
        conn.close()


def delete_word(word_id: str) -> None:
    conn = db_connect()
    try:
        conn.execute("DELETE FROM study_logs WHERE word_id = ?", (word_id,))
        cursor = conn.execute("DELETE FROM words WHERE id = ?", (word_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise ValueError("未找到要删除的单词。")
    finally:
        conn.close()


def review_word(payload: dict) -> dict:
    word_id = str(payload.get("id", "")).strip()
    rating = str(payload.get("rating", "")).strip()

    if rating not in {"know", "vague", "forget"}:
        raise ValueError("rating 必须是 know、vague 或 forget。")

    conn = db_connect()
    try:
        row = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
        if row is None:
            raise ValueError("未找到要复习的单词。")

        familiarity_change = {"know": 2, "vague": 1, "forget": -1}
        delay_hours = {"know": 72, "vague": 24, "forget": 8}
        current = now_ms()
        familiarity = max(0, min(10, row["familiarity"] + familiarity_change[rating]))
        review_count = row["review_count"] + 1
        next_due_at = current + delay_hours[rating] * 60 * 60 * 1000

        conn.execute(
            """
            UPDATE words
            SET familiarity = ?, review_count = ?, next_due_at = ?, last_reviewed_at = ?
            WHERE id = ?
            """,
            (familiarity, review_count, next_due_at, current, word_id),
        )
        conn.execute(
            """
            INSERT INTO study_logs (
                id, date, word_id, word, meaning, rating, familiarity_after, reviewed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                today_key(),
                row["id"],
                row["word"],
                row["meaning"],
                rating,
                familiarity,
                current,
            ),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
        return row_to_word(updated)
    finally:
        conn.close()


def reset_today_log() -> None:
    conn = db_connect()
    try:
        conn.execute("DELETE FROM study_logs WHERE date = ?", (today_key(),))
        conn.commit()
    finally:
        conn.close()


def update_settings(payload: dict) -> dict:
    conn = db_connect()
    try:
        for key, default_value in DEFAULT_SETTINGS.items():
            value = str(payload.get(key, default_value))
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )
        conn.commit()
        return get_settings(conn)
    finally:
        conn.close()


def first_translation(entry: dict) -> str:
    translations = (
        entry.get("content", {})
        .get("word", {})
        .get("content", {})
        .get("trans", [])
    )
    for item in translations:
        text = str(item.get("tranCn", "")).strip()
        if text:
            return text
    return ""


def first_example(entry: dict) -> tuple[str, str]:
    sentences = (
        entry.get("content", {})
        .get("word", {})
        .get("content", {})
        .get("sentence", {})
        .get("sentences", [])
    )
    for item in sentences:
        example = str(item.get("sContent", "")).strip()
        example_cn = str(item.get("sCn", "")).strip()
        if example:
            return example, example_cn
    return "", ""


def import_dataset(file_path: Path) -> dict:
    if not file_path.exists():
        raise ValueError(f"词库文件不存在：{file_path}")

    conn = db_connect()
    inserted = 0
    skipped = 0
    current = now_ms()

    try:
        with file_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue

                entry = json.loads(line)
                word = str(entry.get("headWord", "")).strip().lower()
                meaning = first_translation(entry)
                example_sentence, example_cn = first_example(entry)
                source_ref = (
                    entry.get("content", {})
                    .get("word", {})
                    .get("wordId", "")
                )
                rank_num = entry.get("wordRank")

                if not word or not meaning:
                    skipped += 1
                    continue

                try:
                    conn.execute(
                        """
                        INSERT INTO words (
                            id, word, meaning, tag, source, source_ref, rank_num,
                            example_sentence, example_cn, raw_json, familiarity,
                            review_count, next_due_at, created_at, last_reviewed_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL)
                        """,
                        (
                            str(uuid.uuid4()),
                            word,
                            meaning,
                            "考研词汇",
                            "kaoyan_json",
                            source_ref,
                            rank_num,
                            example_sentence,
                            example_cn,
                            json.dumps(entry, ensure_ascii=False),
                            current,
                            current,
                        ),
                    )
                    inserted += 1
                except sqlite3.IntegrityError:
                    skipped += 1

        conn.commit()
        conn.execute(
            """
            INSERT INTO settings (key, value)
            VALUES ('exam', 'kaoyan')
            ON CONFLICT(key) DO UPDATE SET value = 'kaoyan'
            """
        )
        conn.commit()
        total_words = conn.execute("SELECT COUNT(*) AS count FROM words").fetchone()["count"]
        return {
            "inserted": inserted,
            "skipped": skipped,
            "totalWords": total_words,
            "sourcePath": str(file_path),
            "boundExam": "kaoyan",
        }
    finally:
        conn.close()


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        super().log_message(format, *args)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            json_response(self, {"ok": True, "dbPath": str(DB_PATH)})
            return

        if path == "/api/state":
            json_response(self, get_state())
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        try:
            payload = parse_json(self)

            if path == "/api/words":
                json_response(self, {"word": create_word(payload)}, 201)
                return

            if path == "/api/review":
                json_response(self, {"word": review_word(payload)})
                return

            if path == "/api/reset-today":
                reset_today_log()
                json_response(self, {"ok": True})
                return

            if path == "/api/settings":
                json_response(self, {"settings": update_settings(payload)})
                return

            if path == "/api/import-dataset":
                raw_path = str(payload.get("filePath", "")).strip()
                target = Path(raw_path) if raw_path else DEFAULT_IMPORT_PATH
                json_response(self, import_dataset(target), 201)
                return

            text_response(self, "Unknown API endpoint.", 404)
        except ValueError as exc:
            text_response(self, str(exc), 400)
        except json.JSONDecodeError:
            text_response(self, "请求体不是合法 JSON。", 400)
        except Exception as exc:
            text_response(self, f"服务器错误：{exc}", 500)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path

        try:
            if path.startswith("/api/words/"):
                word_id = path.split("/api/words/", 1)[1]
                delete_word(word_id)
                json_response(self, {"ok": True})
                return

            text_response(self, "Unknown API endpoint.", 404)
        except ValueError as exc:
            text_response(self, str(exc), 400)
        except Exception as exc:
            text_response(self, f"服务器错误：{exc}", 500)


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AppHandler)
    print(f"LexiSprint AI running at http://127.0.0.1:8000")
    print(f"SQLite database: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
