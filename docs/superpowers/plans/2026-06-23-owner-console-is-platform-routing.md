# Owner Console — Plan 1: `is_platform` console routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a signed-in user to the Owner Console vs. the School Console by the backend `is_platform` claim, replacing the `email.endsWith('@schoolmate.io')` heuristic.

**Architecture:** The JWT already carries an `is_platform` claim, but `/auth/me` does not surface it. Expose it on `/auth/me`, add it to the frontend `Me` type, and have `AppProvider.applySession` key the console off that flag instead of the email domain.

**Tech Stack:** Backend — .NET 10 minimal API, xUnit + FluentAssertions integration tests. Frontend — React 19, TypeScript, Vitest + Testing Library.

**Plan series:** This is Plan 1 of the Owner Console rebind (spec: `docs/superpowers/specs/2026-06-23-owner-console-real-api-design.md`). Later plans: react-router URL migration, operator API layer, per-section wiring, owner settings. This plan is independently shippable and testable.

## Global Constraints

- Success envelopes are `{ "data": ... }`; all JSON keys `snake_case`. (`SnakeCaseNamingPolicy` is configured globally — return C# PascalCase anonymous members; they serialize to `snake_case`.)
- Frontend API responses are unwrapped from `{ data }` by `request()` in `src/api/client.ts`; types describe the inner object.
- `is_platform` is a boolean in the `Me` contract; the JWT claim value is the string `"1"` for platform users.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

### Task 1: Expose `is_platform` on `/auth/me` (backend)

**Files:**
- Modify: `sms-backend/src/Sms.Api/Endpoints/AuthEndpoints.cs` (the `g.MapGet("/me", …)` handler)
- Test: `sms-backend/tests/Sms.Tests.Integration/Auth/AuthFlowTests.cs`

**Interfaces:**
- Produces: `GET /v1/auth/me` response gains `is_platform` (bool). Existing fields (`id`, `tenant_id`, `roles`) unchanged.

- [ ] **Step 1: Write the failing test**

Add to `AuthFlowTests` (mirrors the existing `Login_with_seeded_user…` test; the seeded user already has `IsPlatform=1`):

```csharp
    [Fact]
    public async Task Me_exposes_is_platform_for_a_platform_user()
    {
        var hasher = new PasswordHasher();
        var ctx = new TenantContext(); ctx.Set(null, Guid.NewGuid(), true);
        var factory = new SqlConnectionFactory(fx.ConnectionString, ctx);
        var email = $"plat{Guid.NewGuid():N}@x.com";
        await using (var c = await factory.OpenAsync())
            await c.ExecuteAsync(
                "INSERT dbo.Users (Id, Email, PasswordHash, IsPlatform) VALUES (NEWID(),@e,@h,1)",
                new { e = email, h = hasher.Hash("Pass123!") });

        await using var app = AppWithDb();
        var client = app.CreateClient();
        var login = await client.PostAsJsonAsync("/v1/auth/login", new { email, password = "Pass123!" });
        var token = System.Text.Json.JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("data").GetProperty("access_token").GetString();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);

        var me = await client.GetAsync("/v1/auth/me");
        me.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = System.Text.Json.JsonDocument.Parse(await me.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("data").GetProperty("is_platform").GetBoolean().Should().BeTrue();
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter Me_exposes_is_platform_for_a_platform_user`
Expected: FAIL — `is_platform` property is missing from the JSON (`KeyNotFoundException` / property not found).

- [ ] **Step 3: Add the field to the `/me` handler**

In `AuthEndpoints.cs`, change the `/me` response object from:

```csharp
            return Results.Ok(new DataEnvelope<object>(new
            {
                id = sub,
                tenant_id = http.User.FindFirst("tenant_id")?.Value,
                roles = http.User.FindAll("role").Select(c => c.Value).ToArray()
            }));
```

to:

```csharp
            return Results.Ok(new DataEnvelope<object>(new
            {
                id = sub,
                tenant_id = http.User.FindFirst("tenant_id")?.Value,
                roles = http.User.FindAll("role").Select(c => c.Value).ToArray(),
                is_platform = http.User.FindFirst("is_platform")?.Value == "1"
            }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test sms-backend/tests/Sms.Tests.Integration --filter Me_exposes_is_platform_for_a_platform_user`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C sms-backend add src/Sms.Api/Endpoints/AuthEndpoints.cs tests/Sms.Tests.Integration/Auth/AuthFlowTests.cs
git -C sms-backend commit -m "feat(auth): expose is_platform on /auth/me"
```

---

### Task 2: Route the console by `is_platform` (frontend)

**Files:**
- Modify: `sms-admin/src/api/types.ts` (the `Me` interface)
- Modify: `sms-admin/src/context/AppProvider.tsx` (`applySession`, `finishLogin`)
- Test: `sms-admin/src/context/AppProvider.test.tsx`
- Test: `sms-admin/src/App.test.tsx` (owner smoke test mocks)

**Interfaces:**
- Consumes: `Me.is_platform` (bool) from Task 1.
- Produces: `applySession(email: string, role: Role, isPlatform: boolean)` — console kind and hue derive from `isPlatform`, not the email domain.

- [ ] **Step 1: Update the failing tests**

In `AppProvider.test.tsx`, replace the `owner-domain email routes to the owner console` test with two tests that key off `is_platform`:

```tsx
  it('a platform account routes to the owner console', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: null, roles: ['admin'], is_platform: true } })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('owner@anything.com', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.consoleKind).toBe('owner')
    expect(result.current.view).toBe('owner.dashboard')
  })

  it('a non-platform account routes to the school console even with an @schoolmate.io email', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', tenant_id: 't1', roles: ['admin'], is_platform: false } })))
    const { result } = renderHook(() => useApp(), { wrapper })
    await act(async () => { await result.current.loginWithPassword('anil@schoolmate.io', 'pw') })
    await waitFor(() => expect(result.current.loggedIn).toBe(true))
    expect(result.current.consoleKind).toBe('school')
    expect(result.current.view).toBe('school.dashboard')
  })
```

In `App.test.tsx`, the `mockAuth` helper must let the owner smoke test flag a platform session. Change its signature and the owner test:

```tsx
function mockAuth(roles: string[] = ['admin'], tenantId: string | null = 't1', isPlatform = false) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/me')) return jsonResponse({ data: { id: 'u1', tenant_id: tenantId, roles, is_platform: isPlatform } })
    return jsonResponse({ data: { access_token: 'a', refresh_token: 'r' } })
  }))
}
```

And in the `owner demo account lands in the owner console` test, change `mockAuth()` to `mockAuth(['admin'], null, true)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd sms-admin && npx vitest run src/context/AppProvider.test.tsx src/App.test.tsx`
Expected: FAIL — `applySession` still routes by email, so the platform test lands in `school` and/or the type lacks `is_platform`.

- [ ] **Step 3: Add `is_platform` to the `Me` type**

In `src/api/types.ts`:

```ts
export interface Me { id: string; tenant_id: string | null; roles: Role[]; is_platform: boolean }
```

- [ ] **Step 4: Route by `is_platform` in `AppProvider`**

In `src/context/AppProvider.tsx`, change `applySession` to take the flag and use it:

```tsx
  const applySession = (email: string, role: Role, isPlatform: boolean) => {
    setUser({ name: email.split('@')[0], email, role, hue: isPlatform ? 250 : 210 })
    setConsoleKind(isPlatform ? 'owner' : 'school')
    setRole(role)
    setOwnerViewing(false)
    setView(isPlatform ? 'owner.dashboard' : 'school.dashboard')
    setLoggedIn(true)
  }
```

And pass the flag from `finishLogin`:

```tsx
    applySession(email, known.includes(raw as Role) ? (raw as Role) : 'admin', profile.is_platform === true)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd sms-admin && npx vitest run src/context/AppProvider.test.tsx src/App.test.tsx`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Run typecheck and the full suite**

Run: `cd sms-admin && npx tsc -b && npx vitest run`
Expected: `tsc` clean; full suite passes.

- [ ] **Step 7: Commit**

```bash
git -C sms-admin add src/api/types.ts src/context/AppProvider.tsx src/context/AppProvider.test.tsx src/App.test.tsx
git -C sms-admin commit -m "feat(auth): route console by is_platform instead of email domain"
```

---

## Self-Review

- **Spec coverage:** This plan implements the spec's "Identity & console routing" item (Architecture §1) and fills the discovered gap that `/auth/me` did not expose `is_platform`. The react-router migration, API layer, and section wiring are explicitly out of scope for this plan (later plans in the series).
- **Placeholder scan:** No TBD/TODO; every code step shows exact code.
- **Type consistency:** `is_platform` is `bool` in the backend response, `boolean` on `Me`, read as `profile.is_platform === true` in `finishLogin`, and passed as the `isPlatform` parameter of `applySession`. The JWT claim string `"1"` is compared in the backend only.
- **Behavior change callout:** Routing no longer uses the email domain. Both the `AppProvider` and `App` owner tests are updated in Task 2 to mock `is_platform: true`; no other test asserts `consoleKind`.
