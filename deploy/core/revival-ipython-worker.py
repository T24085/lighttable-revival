"""Authenticated Jupyter client; disconnect never shuts down the user's kernel."""
import json
import pathlib
import queue
import re
import sys
import threading
import time

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
wire = sys.stdout


def send(value):
    wire.write(json.dumps(value, ensure_ascii=True) + "\n")
    wire.flush()


try:
    # Wait until the parent has attached its verified process quota.
    configuration = json.loads(sys.stdin.readline())
    executable_directory = pathlib.Path(sys.executable).parent
    package_root = executable_directory.parent if executable_directory.name.lower() == "scripts" else executable_directory
    sys.path.append(str(package_root / "Lib" / "site-packages"))
    from jupyter_client import BlockingKernelClient

    client = BlockingKernelClient()
    client.load_connection_info(configuration["connection"])
    client.start_channels()
    client.wait_for_ready(timeout=8)
    send({"ready": True})
except Exception as error:
    send({"fatal": "IPython connection failed: " + type(error).__name__ + ": " + str(error)})
    sys.exit(1)

commands = queue.Queue(maxsize=16)


def input_loop():
    try:
        for line in sys.stdin:
            commands.put(json.loads(line), timeout=1)
    finally:
        commands.put({"stop": True}, timeout=1)


threading.Thread(target=input_loop, daemon=True).start()
active = None
ending = False


def interrupt():
    client.control_channel.send(client.session.msg("interrupt_request", content={}))


try:
    while not ending:
        try:
            request = commands.get(timeout=0.02)
            if request.get("stop"):
                if active:
                    interrupt()
                ending = True
                continue
            if request.get("interrupt"):
                if active:
                    interrupt()
                continue
            if active:
                send({"id": request["id"], "error": {"message": "IPython is already evaluating", "line": 1}})
                continue
            message_id = client.execute(request["source"], silent=False, store_history=False, allow_stdin=False)
            active = {"id": request["id"], "message_id": message_id, "logs": "", "value": "None", "error": None,
                      "idle": False, "reply": False, "started": time.monotonic(), "bytes": 0}
        except queue.Empty:
            pass
        if not active:
            continue
        for channel in (client.iopub_channel, client.shell_channel):
            for _ in range(64):
                if not channel.msg_ready():
                    break
                message = channel.get_msg(timeout=0)
                if message.get("parent_header", {}).get("msg_id") != active["message_id"]:
                    continue
                active["bytes"] += len(json.dumps(message["content"]))
                if active["bytes"] > 1024 * 1024:
                    raise RuntimeError("IPython response exceeds 1 MiB")
                content, kind = message["content"], message["header"]["msg_type"]
                if kind == "stream":
                    active["logs"] += content.get("text", "")
                    if len(active["logs"]) > 32768:
                        raise RuntimeError("IPython output exceeds 32 KiB")
                elif kind in ("execute_result", "display_data"):
                    active["value"] = str(content.get("data", {}).get("text/plain", "None"))
                    if len(active["value"]) > 4096:
                        raise RuntimeError("IPython value exceeds 4 KiB")
                elif kind == "error" or kind == "execute_reply" and content.get("status") == "error":
                    trace = re.sub(r"\x1b\[[0-9;]*m", "", "\n".join(content.get("traceback", [])))
                    matches = re.findall(r"Cell In\[[^\]]+\], line (\d+)", trace)
                    active["error"] = {"message": str(content.get("ename", "Error")) + ": " + str(content.get("evalue", "")),
                                       "line": int(matches[0]) if matches else 1, "column": 1}
                elif kind == "status" and content.get("execution_state") == "idle":
                    active["idle"] = True
                if kind == "execute_reply":
                    active["reply"] = True
        if active["idle"] and active["reply"]:
            send({"id": active["id"], "value": active["value"], "logs": active["logs"], "error": active["error"]})
            active = None
        elif time.monotonic() - active["started"] > 30:
            interrupt()
            raise RuntimeError("IPython execution exceeded 30000 ms")
except Exception as error:
    if active:
        try:
            interrupt()
        except Exception:
            pass
    send({"fatal": type(error).__name__ + ": " + str(error)})
finally:
    client.stop_channels()
