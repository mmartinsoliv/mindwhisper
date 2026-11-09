# Providers

Mindwhisper never talks to a speech or language provider from the desktop app. The app calls its own backend (`server/`), and the backend calls the provider with keys that only exist in the server environment.

## 1. Interfaces

| Interface | File | Role |
|---|---|---|
| `SttProvider` | `server/src/providers/types.ts` | Server side: `transcribe({ audio, language, vocabulary, signal }) → { text, language, durationMs }` |
| `LlmProvider` | `server/src/providers/types.ts` | Server side: `cleanup({ text, language, style, removeFillers, autoPunctuation, dictionary, signal }) → string` |
| `TranscriptionProvider` | `src/services/transcription/TranscriptionProvider.ts` | Client side: `transcribe(audio, options) → TranscriptionResult`, with an optional `transcribeStream` reserved for streaming. The only implementation, `BackendTranscriptionProvider`, posts to the server's `/v1/transcribe`. |

Implementations live next to the interfaces: `openaiStt.ts`, `anthropicLlm.ts`, `geminiStt.ts`, `geminiLlm.ts` (both share `geminiClient.ts`) and `mock.ts` (both mocks). `server/src/providers/index.ts` (`buildProviders`) picks one per interface from the configuration.

## 2. Configuration

Copy `server/.env.example` to `server/.env` and set the values there (the same names are listed in the root `.env.example`; values never go in the repository). `pnpm server:dev` and `pnpm start` (in `server/`) load that file automatically and need Node 22.9 or newer. The file lists every variable with a blank value: **a blank value counts as unset and the default below applies**, so you only fill in what you want to change. `APP_TOKENS` is the one variable that has no default and must be set (in the file or in the shell). A missing `.env` is fine as long as the variables come from the shell, which also takes precedence over the file. Defaults are the ones in `server/src/config.ts`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Port the server listens on. |
| `APP_TOKENS` | none (required) | Comma-separated access tokens. The server refuses to start with an empty list. |
| `RATE_LIMIT_PER_MIN` | `30` | Requests per minute per token. |
| `STT_PROVIDER` | `mock` | `openai`, `gemini` or `mock`. |
| `OPENAI_API_KEY` | none | Required when `STT_PROVIDER=openai`. |
| `STT_MODEL` | `gpt-4o-mini-transcribe` (OpenAI), `gemini-2.5-flash` (Gemini) | Transcription model; the default depends on `STT_PROVIDER`. |
| `LLM_PROVIDER` | `mock` | `anthropic`, `gemini` or `mock`. |
| `ANTHROPIC_API_KEY` | none | Required when `LLM_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | none | Required when `STT_PROVIDER=gemini` or `LLM_PROVIDER=gemini`. One key serves both. |
| `LLM_MODEL` | `claude-haiku-5-5` (Anthropic), `gemini-2.5-flash-lite` (Gemini) | Model used for text cleanup; the default depends on `LLM_PROVIDER`. The Anthropic default has not been checked against a live account; set it to a model your account can call. |

`mock` needs no external account: the speech mock returns a fixed transcript and the cleanup mock removes a few filler words and adds punctuation. It exists for development and tests, not for judging quality.

Gemini only (one key, no OpenAI or Anthropic account):

```
APP_TOKENS=<token-for-each-user>
STT_PROVIDER=gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini key>
```

Gemini was exercised once against the live API (2026-10-29) with two short synthetic `say` recordings (pt-BR and English): `gemini-2.5-flash` and `gemini-2.5-flash-lite` transcribed and cleaned both correctly in 0.5 to 4 s per step; the 3.x models took 11 to 18 s per step. That is a smoke test, not the benchmark below. Audio is sent inline in the request, so the 25 MB upload cap applies.

Example for real providers (placeholders, not real values):

```
APP_TOKENS=<token-for-each-user>
STT_PROVIDER=openai
OPENAI_API_KEY=<your OpenAI key>
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=<your Anthropic key>
```

## 3. Adding a provider

1. Implement `SttProvider` or `LlmProvider` in `server/src/providers/<name>.ts`. Honour the abort `signal`, map vendor failures to `ProviderError` (`provider_error` or `provider_timeout`), and never log audio or text.
2. Register it in `buildProviders` (`server/src/providers/index.ts`).
3. Extend the zod enum for `STT_PROVIDER` or `LLM_PROVIDER` in `server/src/config.ts`, and add its key to the required-variable checks in `loadConfig`.
4. Add tests with a mocked `fetch` next to the adapter (see `openaiStt.test.ts` and `anthropicLlm.test.ts`): success, vendor error status, timeout, malformed body.
5. Document its variables in the table above, and add a row to the results table below once it has been measured.

## 4. Evaluation protocol: choosing a speech provider for Portuguese (Brazil) and English

**Status: no provider has been benchmarked yet.** The OpenAI and Anthropic adapters were written against public documentation and have only been exercised against mocked HTTP. The Gemini adapters also passed the short live smoke test described above. Nothing in this repository shows real accuracy, latency or cost.

### Criteria

1. Accuracy in Portuguese (Brazil) and English, including accents, code-switching and background noise.
2. Streaming support and latency (time from the end of speech to the final text).
3. Handling of technical vocabulary and proper names (custom vocabulary, prompt hints or keyword boosting).
4. Pricing at the expected usage (per minute of audio, minimum billing unit, rate limits).
5. Data retention and privacy: whether audio and transcripts are stored, for how long, whether they are used for training, and whether a zero-retention option exists.
6. Official SDKs and API stability (languages supported, maintenance, versioning).

### Measurement recipe

1. Prepare 20 sentences per language (Portuguese (Brazil), English), 40 in total. In each language, 5 sentences must contain technical terms (product names, acronyms, code identifiers). Write the reference text for every sentence before recording.
2. Record every sentence once on the target hardware with the microphone people will actually use. Keep the WAV files outside the repository.
3. For each provider and each recording, run the transcription through the backend (or the provider's API directly) and store the text.
4. Normalise both reference and result (lower case, no punctuation, numbers spelled the same way) and compute word error rate: `(substitutions + deletions + insertions) / words in the reference`. Report it per language and separately for the technical subset.
5. Measure the time from the stop action to the final transcript, at least 10 runs per provider, on the target machine and network. Report the median and the slowest run.
6. Read each vendor's current retention and training-use policy on the day of testing. Record the date and the link.
7. Compare cost for 1 hour of audio per user per month using the vendor's published pricing on that day.

### Results (to fill in)

| Provider / model | Date | WER PT-BR | WER EN | WER technical subset | Median stop → text (ms) | Slowest (ms) | Price per audio hour | Retention / training policy (link, date) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |
| | | | | | | | | | |
| | | | | | | | | | |
