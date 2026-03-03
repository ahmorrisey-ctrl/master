/**
 * Shared HTTP client with retry logic, rate limiting, and error handling
 * for all Clay integration API calls.
 */

const https = require('https');
const { URL } = require('url');

class ApiClient {
  constructor(baseUrl, defaultHeaders = {}, options = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 2000;
    this.rateLimitPerMinute = options.rateLimitPerMinute || 100;
    this.requestTimestamps = [];
  }

  async request(method, path, body = null, extraHeaders = {}) {
    await this._enforceRateLimit();

    const url = new URL(path, this.baseUrl);
    const headers = { ...this.defaultHeaders, ...extraHeaders };

    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this._makeRequest(method, url, headers, body);
        this.requestTimestamps.push(Date.now());
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries && this._isRetryable(err)) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await this._sleep(delay);
        } else if (!this._isRetryable(err)) {
          throw err;
        }
      }
    }
    throw lastError;
  }

  async get(path, headers = {}) {
    return this.request('GET', path, null, headers);
  }

  async post(path, body, headers = {}) {
    return this.request('POST', path, body, headers);
  }

  async put(path, body, headers = {}) {
    return this.request('PUT', path, body, headers);
  }

  async patch(path, body, headers = {}) {
    return this.request('PATCH', path, body, headers);
  }

  async delete(path, headers = {}) {
    return this.request('DELETE', path, null, headers);
  }

  _makeRequest(method, url, headers, body) {
    return new Promise((resolve, reject) => {
      const options = {
        method,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const statusCode = res.statusCode;
          if (statusCode >= 200 && statusCode < 300) {
            try {
              resolve({ statusCode, data: JSON.parse(data), headers: res.headers });
            } catch {
              resolve({ statusCode, data, headers: res.headers });
            }
          } else {
            const err = new Error(`HTTP ${statusCode}: ${data}`);
            err.statusCode = statusCode;
            err.responseBody = data;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  _isRetryable(err) {
    if (!err.statusCode) return true; // network error
    return err.statusCode === 429 || err.statusCode >= 500;
  }

  async _enforceRateLimit() {
    const now = Date.now();
    const windowStart = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    if (this.requestTimestamps.length >= this.rateLimitPerMinute) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitMs = oldestInWindow + 60000 - now + 100;
      await this._sleep(waitMs);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ApiClient };
