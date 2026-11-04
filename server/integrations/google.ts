import { createHash } from "node:crypto";
import { HttpClient, IntegrationError, jsonBody, externalId } from "./http.js";
import type { Config } from "../config.js";
export class GoogleClient {
  private token?: { value: string; expires: number };
  constructor(
    private config: Config["google"],
    private http = new HttpClient(),
  ) {}
  private async headers() {
    if (
      !this.config.clientId ||
      !this.config.clientSecret ||
      !this.config.refreshToken
    )
      throw new IntegrationError("google_nao_configurado");
    if (!this.token || this.token.expires < Date.now() + 60000) {
      const token = await this.http.json<{
        access_token: string;
        expires_in: number;
      }>("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      this.token = {
        value: token.access_token,
        expires: Date.now() + token.expires_in * 1000,
      };
    }
    return {
      Authorization: "Bearer " + this.token.value,
      "Content-Type": "application/json",
    };
  }
  private async call<T>(url: string, method = "GET", body?: unknown) {
    return this.http.json<T>(url, {
      method,
      headers: await this.headers(),
      body: body === undefined ? undefined : jsonBody(body),
    });
  }
  listDriveFiles() {
    return this.call<{
      files: { id: string; name: string; mimeType: string }[];
    }>(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: "trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.spreadsheet')",
          fields: "files(id,name,mimeType)",
          pageSize: "50",
        }),
    );
  }
  copyDoc(templateId: string, name: string, intentId: string) {
    return this.call<{ id: string }>(
      "https://www.googleapis.com/drive/v3/files/" +
        externalId(templateId) +
        "/copy",
      "POST",
      { name, appProperties: { pulsoo_intent: intentId } },
    );
  }
  replaceDoc(documentId: string, values: Record<string, string>) {
    return this.call(
      "https://docs.googleapis.com/v1/documents/" +
        externalId(documentId) +
        ":batchUpdate",
      "POST",
      {
        requests: Object.entries(values).map(([name, text]) => ({
          replaceAllText: {
            containsText: { text: "{{" + name + "}}", matchCase: true },
            replaceText: text,
          },
        })),
      },
    );
  }
  trashFile(fileId: string) {
    return this.call(
      "https://www.googleapis.com/drive/v3/files/" + externalId(fileId),
      "PATCH",
      { trashed: true },
    );
  }
  createSpreadsheet(title: string) {
    return this.call<{ spreadsheetId: string }>(
      "https://sheets.googleapis.com/v4/spreadsheets",
      "POST",
      { properties: { title } },
    );
  }
  readRows(id: string, range: string) {
    return this.call<{ values?: string[][] }>(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        "/values/" +
        encodeURIComponent(range),
    );
  }
  appendRows(id: string, range: string, values: unknown[][]) {
    return this.call(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        "/values/" +
        encodeURIComponent(range) +
        ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      "POST",
      { values },
    );
  }
  updateRows(id: string, range: string, values: unknown[][]) {
    return this.call(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        "/values/" +
        encodeURIComponent(range) +
        "?valueInputOption=RAW",
      "PUT",
      { values },
    );
  }
  deleteRows(
    id: string,
    sheetId: number,
    startIndex: number,
    endIndex: number,
  ) {
    if (
      !Number.isInteger(startIndex) ||
      startIndex < 0 ||
      !Number.isInteger(endIndex) ||
      endIndex <= startIndex ||
      !Number.isInteger(sheetId)
    )
      throw new IntegrationError("intervalo_de_linhas_invalido");
    return this.call(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        ":batchUpdate",
      "POST",
      {
        requests: [
          {
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex, endIndex },
            },
          },
        ],
      },
    );
  }
  addSheet(id: string, title: string) {
    return this.call(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        ":batchUpdate",
      "POST",
      { requests: [{ addSheet: { properties: { title } } }] },
    );
  }
  deleteSheet(id: string, sheetId: number) {
    return this.call(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        externalId(id) +
        ":batchUpdate",
      "POST",
      { requests: [{ deleteSheet: { sheetId } }] },
    );
  }
  freeBusy(
    calendarIds: string[],
    start: string,
    end: string,
    timeZone: string,
  ) {
    return this.call<{
      calendars: Record<string, { busy: { start: string; end: string }[] }>;
    }>("https://www.googleapis.com/calendar/v3/freeBusy", "POST", {
      timeMin: start,
      timeMax: end,
      timeZone,
      items: calendarIds.map((id) => ({ id })),
    });
  }
  createEvent(
    calendarId: string,
    event: {
      summary: string;
      description?: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      attendees?: { email: string }[];
    },
    intentId: string,
  ) {
    return this.call<{ id: string }>(
      "https://www.googleapis.com/calendar/v3/calendars/" +
        externalId(calendarId) +
        "/events?sendUpdates=all",
      "POST",
      {
        ...event,
        id: createHash("sha256").update(intentId).digest("hex"),
        extendedProperties: { private: { pulsoo_intent: intentId } },
      },
    );
  }
}
