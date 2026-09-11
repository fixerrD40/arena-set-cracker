import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, delay } from 'rxjs/operators';

import { ScryfallCard } from './models/card.scryfall';
import { ScryfallSet } from './models/set.scryfall';

@Injectable({
  providedIn: 'root',
})
export class ScryfallService {
  private readonly http = inject(HttpClient);

  // api. subdomain avoids an HTTP redirect that breaks some clients
  private readonly baseUrl = 'https://api.scryfall.com';

  // Chromium/Electron block User-Agent on renderer requests; Electron sets it in desktop.js.
  private readonly httpOptions = {
    headers: new HttpHeaders({
      Accept: 'application/json'
    })
  };

  public isValidSetCode(code: string): Observable<boolean> {
    return this.getSetByCode(code).pipe(
      map(() => true),
      catchError((err) => {
        if (err.status === 404) return of(false);
        return throwError(() => new Error(`Failed to validate set code: ${code}`));
      })
    );
  }

  public getSetByCode(code: string): Observable<ScryfallSet> {
    return this.http.get<ScryfallSet>(
      `${this.baseUrl}/sets/${code.toLowerCase()}`,
      this.httpOptions
    );
  }

  /** Non-digital sets only (offline cache targets). */
  public getAvailableSets(): Observable<ScryfallSet[]> {
    return this.http.get<{ data: ScryfallSet[] }>(`${this.baseUrl}/sets`, this.httpOptions).pipe(
      map((response) => {
        const setList = response.data || [];
        return setList.filter(set => !set.digital);
      })
    );
  }

  /**
   * Arena printings of this set. `is:arena` matches oracle availability and
   * Scryfall's default unique=cards then prefers a paper reprint with no arena_id
   * (LTR basics). `game:arena` is the printing on Arena.
   */
  public getCardsBySet(code: string): Observable<ScryfallCard[]> {
    const url = `${this.baseUrl}/cards/search?q=set:${code.toLowerCase()}+game:arena`;
    return this.fetchAllPages(url);
  }

  /** Child sets whose parent is this code (tokens, helpers). Includes digital. */
  public getCompanionSets(code: string): Observable<ScryfallSet[]> {
    const parent = code.toLowerCase();
    return this.http.get<{ data: ScryfallSet[] }>(`${this.baseUrl}/sets`, this.httpOptions).pipe(
      map((response) =>
        (response.data || [])
          .map((raw) => new ScryfallSet(raw))
          .filter((set) => set.parent_set_code?.toLowerCase() === parent)
      )
    );
  }

  /** Every printing in a set code — tokens have no `game:arena` filter. */
  public getSetPrintings(code: string): Observable<ScryfallCard[]> {
    const url = `${this.baseUrl}/cards/search?q=set:${code.toLowerCase()}`;
    return this.fetchAllPages(url).pipe(
      catchError((err) => {
        if (err?.status === 404) {
          return of([]);
        }
        return throwError(() => err);
      })
    );
  }

  /** Follows Scryfall pagination with a 100ms delay between pages (rate limit). */
  private fetchAllPages(url: string, accumulated: ScryfallCard[] = []): Observable<ScryfallCard[]> {
    return this.http.get<{ has_more: boolean; next_page?: string; data: ScryfallCard[] }>(url, this.httpOptions).pipe(
      switchMap(response => {
        const pageCards = (response.data || []).map((raw) => new ScryfallCard(raw));
        const combined = [...accumulated, ...pageCards];

        if (response.has_more && response.next_page) {
          return of(null).pipe(
            delay(100),
            switchMap(() => this.fetchAllPages(response.next_page!, combined))
          );
        }

        return of(combined);
      }),
      catchError((err) => {
        console.error('Failed to parse a paginated page stream chunk:', err?.message || err);
        return throwError(() => err);
      })
    );
  }
}
