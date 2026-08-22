#!/usr/bin/env python3
"""Hook di contesto per Claude Code (sito personale).

SessionStart: inietta drafts/NOTES.md nel contesto, cosi' "continua" riparte dallo stato.
UserPromptSubmit: stima la dimensione del contesto dal transcript e
  - sopra SOFT_LIMIT chiede a Claude di chiudere la risposta invitando ad aprire una nuova chat;
  - sopra HARD_LIMIT dopo IDLE_MINUTES di pausa blocca il messaggio (la cache e' scaduta:
    la richiesta ricaricherebbe tutto il contesto a prezzo pieno).
Qualsiasi errore interno termina con exit 0, senza mai bloccare per sbaglio.
"""
import json
import os
import sys
from datetime import datetime, timezone

SOFT_LIMIT = 100_000   # token oltre i quali suggerire una nuova chat
HARD_LIMIT = 60_000    # token oltre i quali bloccare se la cache e' scaduta
IDLE_MINUTES = 60      # durata della cache del prompt su abbonamento
NOTES = os.path.join("drafts", "NOTES.md")


def read_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def context_stats(path):
    """Ritorna (token di contesto dell'ultimo turno assistant, timestamp dell'ultimo messaggio)."""
    ctx, last_ts = 0, None
    if not path or not os.path.exists(path):
        return ctx, last_ts
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if obj.get("isSidechain"):
                continue
            ts = obj.get("timestamp")
            if ts:
                last_ts = ts
            if obj.get("type") == "assistant":
                usage = (obj.get("message") or {}).get("usage") or {}
                total = 0
                for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
                    try:
                        total += int(usage.get(key) or 0)
                    except (TypeError, ValueError):
                        pass
                if total:
                    ctx = total
    return ctx, last_ts


def idle_minutes(ts):
    if not ts:
        return 0
    try:
        t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - t).total_seconds() / 60
    except Exception:
        return 0


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    data = read_input()
    event = data.get("hook_event_name", "")

    if event == "SessionStart":
        if os.path.exists(NOTES):
            with open(NOTES, encoding="utf-8", errors="ignore") as f:
                notes = f.read().strip()
            if notes:
                print("[hook stato] Contenuto attuale di drafts/NOTES.md. Se Federico scrive "
                      "«continua», riparti da qui senza rifare il brief:\n" + notes)
        return 0

    if event == "UserPromptSubmit":
        ctx, last_ts = context_stats(data.get("transcript_path"))
        idle = idle_minutes(last_ts)
        k = ctx // 1000
        if ctx >= HARD_LIMIT and idle >= IDLE_MINUTES:
            prompt = (data.get("prompt") or "").strip()
            sys.stderr.write(
                f"[hook contesto] Messaggio NON inviato per risparmiare token: il contesto è a ~{k}k token "
                f"e la cache è scaduta (pausa di {int(idle)} minuti). Apri una nuova chat, scrivi «continua» "
                f"e poi reinvia il tuo messaggio:\n\n{prompt}\n")
            return 2
        if ctx >= SOFT_LIMIT:
            print(f"[hook contesto] Il contesto di questa chat è a ~{k}k token. Esegui normalmente la richiesta. "
                  "Se drafts/NOTES.md non riporta già la variante in lavorazione e le ultime decisioni, aggiornalo. "
                  f"Poi chiudi la risposta con la riga: «Contesto a ~{k}k token: per risparmiare apri una nuova chat "
                  "e scrivi 'continua', lo stato è in drafts/NOTES.md».")
        return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
