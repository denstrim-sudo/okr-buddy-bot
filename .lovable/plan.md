# План: вернуть Claude и Gemini в селектор моделей

## Цель
Восстановить выбор Claude Sonnet и Gemini в Модулях 1–3, использовав те ID, которые реально работают на шлюзе AIAI.BY (`https://vedai.by/api/v1`), а не те, что возвращали 404/503.

## Шаги

### 1. Подобрать рабочие ID на шлюзе
Сделать живые пробы через существующую Edge Function `interpret-okr-input` (минимальный валидный payload) по списку кандидатов:

- Claude: `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929`, `claude-3-7-sonnet-latest`, `claude-3-5-sonnet-latest`, `claude-3-5-sonnet-20241022`, `claude-haiku-4-5`
- Gemini: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-exp-1206`

Для каждого ID фиксируем: `200 OK` → рабочий; `404 model_not_found` → выкинуть; `503 all_providers_failed` → отложить как «нестабильный».

### 2. Обновить `src/contexts/ModelContext.tsx`
- Оставить `gpt-4o` (дефолт) и `gpt-4o-mini`.
- Добавить **по одной самой свежей рабочей** модели каждого семейства Claude и Gemini из проб шага 1.
- Если ничего из Claude/Gemini не отвечает 200 — оставить семейство закрытым и явно сказать об этом в ответе пользователю (не показывать заведомо нерабочий пункт).
- Обновить `hint` так, чтобы было понятно семейство и роль (быстрая/сильная).

### 3. Никаких изменений в `_shared/ai.ts`
Текущий backend-fallback на `gpt-4o` уже корректно ловит `model_unavailable` / `provider_unavailable`, поэтому если выбранная Claude/Gemini временно ляжет, запрос всё равно выполнится. Логику не трогаем.

### 4. Проверка
- Прогнать `interpret-okr-input` с каждым новым ID — должен вернуться 200.
- Открыть селектор в UI и убедиться, что список соответствует обновлённому `AI_MODELS`.
- Прогнать существующий vitest (`OkrGenerator.test.tsx`, `OkrValidator.test.tsx`, `useSolutionStudio.test.tsx`) — никаких регрессий в UI.

## Технические детали
- Файл изменений: только `src/contexts/ModelContext.tsx`.
- Пробы делаются через `supabase--curl_edge_functions` на `/interpret-okr-input` с body `{"raw_input":"ping","model":"<ID>"}`.
- Источник правды — что вернул шлюз сейчас, а не вчерашние данные и не каталог провайдера.
