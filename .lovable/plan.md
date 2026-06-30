## Причина (подтверждена логами)

В edge-логах `draft-okr` видно:

```
ERROR AIAI.BY error 404 {"error":{"message":"Model 'claude-3-5-sonnet-latest' not found or not available","code":"model_not_found"}}
WARNING AI model fallback claude-3-5-sonnet-latest -> gpt-4o model_unavailable
```

То есть выбор модели **уходит на бэкенд корректно** (фронт прокидывает `model` во все 6 edge-функций, бэкенд читает и передаёт в `chat/completions`), но AIAI.BY возвращает `404 model_not_found` для большинства ID из нашего жёсткого списка. В `_shared/ai.ts` это намеренно ловится и **молча** падает в `gpt-4o` — поэтому в статистике vedai всегда виден только `gpt-4o`. Пользователь не получает никакого сигнала о подмене.

## Что делаем

### 1. Источник истины для списка моделей — live-каталог AIAI.BY
- Новая edge-функция `list-ai-models` (GET): дергает `${AIAI_BASE_URL}/models` с `AIAI_API_KEY`, кэширует ответ в памяти на 10 минут, возвращает массив `{ id, label, hint }`.
- Падение апстрима → возвращаем последний удачный кэш либо безопасный мини-список (`gpt-4o`, `gpt-4o-mini`) c пометкой `degraded: true`.

### 2. Фронт берёт список с бэкенда, а не хардкодит
- `ModelContext.tsx`: вместо константы `AI_MODELS` — `useEffect` грузит каталог через `supabase.functions.invoke("list-ai-models")` один раз при монтировании, кладёт в state, селект ждёт загрузку (skeleton в `ModelSelector`).
- Если сохранённый в localStorage ID отсутствует в свежем каталоге — сбрасываем на дефолт и показываем тост «Ранее выбранная модель больше недоступна, переключено на …».
- Удаляем устаревший хардкод (`claude-sonnet-4-5`, `claude-3-5-sonnet-latest`, `gemini-1.5-pro` и т.д.) — оставляем только то, что реально вернул каталог.

### 3. Видимая пользователю подмена модели (нет тихих fallback)
Бэкенд (`_shared/ai.ts`) уже знает, когда подменил модель. Сейчас факт подмены теряется в ответе.
- В `callAITool` / `callAIToolExtended` добавляем в JSON-ответ служебное поле `_meta: { requested_model, used_model, fallback_reason }`.
- Все 6 edge-функций пропускают это поле наружу (минимальная правка — оно уже в общем envelope).
- На фронте после каждого `supabase.functions.invoke` проверяем `data._meta?.used_model !== data._meta?.requested_model` и показываем единый toast: «Модель <X> сейчас недоступна у провайдера, запрос выполнен через <Y>».

### 4. TDD-покрытие
- `supabase/functions/_shared/ai.test.ts` (новый): мок `fetch`, кейсы — успешный запрос (`_meta.used_model === requested`), 404 → fallback (`_meta.fallback_reason === "model_unavailable"`, `used_model === "gpt-4o"`), 503 → fallback.
- `supabase/functions/list-ai-models/index.test.ts`: моки на `/models`, проверка кэша (второй вызов не ходит в сеть), деградация при ошибке апстрима.
- `src/contexts/__tests__/ModelContext.test.tsx`: ремаунт грузит каталог; сохранённый невалидный ID сбрасывается; селект отдаёт текущий выбор в `useAiModel`.
- Существующие тесты edge-функций обновляем под новый формат ответа (`{ ...data, _meta }`).

### 5. Документация в UI
В тултип селектора моделей добавить строку: «Список загружен из AIAI.BY. Если выбранная модель временно недоступна, провайдер выполнит запрос через GPT-4o — вы увидите уведомление».

## Что не трогаем
- Не меняем формат сохранённых OKR (`SavedOkr`), не трогаем `OkrTree`, `ParentKrPicker`, `scoring.ts`, `okr_rules.ts`.
- Не вводим Lovable AI Gateway вместо AIAI.BY — пользователь сознательно выбрал внешнего провайдера в одной из прошлых фаз.
- Не убираем дефолтный `gpt-4o` как fallback — это последняя страховка от полного отказа.

## Технические детали

```text
Frontend                          Edge function                     AIAI.BY
ModelSelector ─┐
               ├─► list-ai-models ─────────────────► GET /v1/models
ModelContext ◄─┘   (cache 10m)

OkrGenerator ──► draft-okr ──► callAITool({model})
                                     │
                                     ├─ POST /v1/chat/completions
                                     │     model: claude-haiku-4-5
                                     │     ◄── 404 model_not_found
                                     │
                                     └─ retry with gpt-4o
                                            └─ возвращает + _meta:{
                                                 requested_model: "claude-haiku-4-5",
                                                 used_model: "gpt-4o",
                                                 fallback_reason: "model_unavailable" }

Frontend читает _meta → toast «Модель X недоступна, выполнено через Y»
```

## Acceptance criteria
- [ ] В селекторе моделей видны только ID, которые реально отвечают `200` у AIAI.BY (проверяется тем, что в vedai-статистике после выбора этой модели приходит запрос именно с её ID).
- [ ] При выборе модели, которая внезапно стала недоступна, UI явно сообщает о подмене (toast), а не делает её молча.
- [ ] Каталог моделей не хардкодится во фронте — приходит с бэкенда.
- [ ] Все существующие тесты + новые 3 файла зелёные.
