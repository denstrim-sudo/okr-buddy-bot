Fix missing negative test case for `rewritten_objective_warning` in `OkrValidator.test.tsx`.

**What to change:**
Add one test to `src/components/aimbot/__tests__/OkrValidator.test.tsx` that asserts the warning notice is NOT rendered when `rewritten_objective_warning` is `false` or `undefined`.

**Test body:**
```ts
it("does NOT render warning notice when flag is false/undefined", async () => {
  invokeMock.mockResolvedValueOnce({ data: { ...validReport, rewritten_objective_warning: false }, error: null });
  renderWithProviders(<OkrValidator draft={{ objective: "X", key_results: ["KR1"] }} />);
  await userEvent.click(screen.getByRole("button", { name: /Запустить аудит/i }));
  await screen.findByText(validReport.summary);
  expect(screen.queryByTestId("rewritten-objective-warning")).not.toBeInTheDocument();
});
```

Run `vitest run` to confirm the new test passes alongside existing ones.