import { HttpClient, IntegrationError, jsonBody, externalId } from "./http.js";
export class CalClient {
  constructor(
    private key: string,
    private versions: { slots: string; bookings: string },
    private http = new HttpClient(),
  ) {}
  private headers(version: string) {
    if (!this.key) throw new IntegrationError("calcom_nao_configurado");
    return {
      Authorization: "Bearer " + this.key,
      "Content-Type": "application/json",
      "cal-api-version": version,
    };
  }
  slots(eventTypeId: number, start: string, end: string, timeZone: string) {
    return this.http.json(
      "https://api.cal.com/v2/slots?" +
        new URLSearchParams({
          eventTypeId: String(eventTypeId),
          start,
          end,
          timeZone,
        }),
      { headers: this.headers(this.versions.slots) },
    );
  }
  book(
    eventTypeId: number,
    start: string,
    attendee: { name: string; email: string; timeZone: string },
  ) {
    return this.http.json<{ data: { uid: string } }>(
      "https://api.cal.com/v2/bookings",
      {
        method: "POST",
        headers: this.headers(this.versions.bookings),
        body: jsonBody({ eventTypeId, start, attendee }),
      },
    );
  }
  cancel(uid: string, reason: string) {
    return this.http.json(
      "https://api.cal.com/v2/bookings/" + externalId(uid) + "/cancel",
      {
        method: "POST",
        headers: this.headers(this.versions.bookings),
        body: jsonBody({ cancellationReason: reason }),
      },
    );
  }
}
