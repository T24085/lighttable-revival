"""Persistent local Python REPL. Project code is sent only after quota attachment."""
import ast
import contextlib
import io
import json
import sys
import traceback
import site

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
wire = sys.stdout
namespace = {"__name__": "__main__"}


class Output(io.StringIO):
    def write(self, value):
        if self.tell() + len(value) > 32768:
            raise RuntimeError("REPL output exceeds 32 KiB")
        return super().write(value)


def send(value):
    wire.write(json.dumps(value, ensure_ascii=True) + "\n")
    wire.flush()


send({"ready": True, "version": sys.version.split()[0]})
for line in sys.stdin:
    request = json.loads(line)
    output = Output()
    source, filename = request["source"], request["path"]
    execution_filename = filename + "#lt-repl-" + request["id"]
    if request.get("root") not in sys.path:
        sys.path.insert(0, request["root"])
    # Enable installed packages after attachment without executing .pth files or
    # sitecustomize before the parent establishes the native process quota.
    for package_path in site.getsitepackages():
        if package_path not in sys.path:
            sys.path.append(package_path)
    namespace["__file__"] = filename
    response = {"id": request["id"]}
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            tree = ast.parse(source, filename=filename, mode="exec")
            value = None
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                expression = tree.body.pop().value
                exec(compile(tree, execution_filename, "exec"), namespace)
                value = eval(compile(ast.Expression(expression), execution_filename, "eval"), namespace)
            else:
                exec(compile(tree, execution_filename, "exec"), namespace)
            response["value"] = repr(value)[:4096]
    except BaseException as error:
        frames = traceback.extract_tb(error.__traceback__)
        # Older functions retain their defining code object. Link to their
        # current callsite rather than assigning an old line to a new buffer.
        frame = next((item for item in reversed(frames)
                      if item.filename == execution_filename), None)
        response["error"] = {
            "message": type(error).__name__ + ": " + str(error)[:4096],
            "line": getattr(error, "lineno", None) or (frame.lineno if frame else 1),
            "column": getattr(error, "offset", None) or 1,
        }
    response["logs"] = output.getvalue()[:32768]
    send(response)
