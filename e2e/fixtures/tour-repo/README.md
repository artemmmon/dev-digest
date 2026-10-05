# tour-sample

A tiny Python service used as the fixture repository of the DevDigest onboarding tour e2e flow.
It is not a real project: nothing here is run by the test suite.

## Run it locally

```sh
cp .env.example .env
make install
make run
```

The API listens on port 8000 and answers `GET /health` and `GET /items`.
