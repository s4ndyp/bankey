import { Component, computed, effect, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// --- Interfaces ---
interface ApiConfig {
    url: string; // Bijv. 'http://andere-server:8080'
    token: string; // Het ontvangen JWT token
    username: string; // Verplicht
    password?: string; // Tijdelijk veld, niet persistent opgeslagen
    endpointName: string; // Naam van het unieke dashboard endpoint
}

// OPGELOST: ConfigBase type is nu string om conflicten met Transaction['type'] op te lossen.
interface ConfigBase {
    id: string;
    type: string; 
    subType: string;
}

interface Transaction {
  id: string; // MongoDB ObjectId
  date: string; // ISO format YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense'; 
  category: string;
  accountNumber?: string;
  currentBalance?: number; // Veld: Saldo na transactie
  tags?: string[]; // Tags
}

interface CsvMapping {
  dateCol: number;
  descCol: number;
  amountCol: number;
  categoryCol?: number;
  accountCol?: number;
  balanceCol?: number;
}

interface CsvMappingTemplate extends CsvMapping, ConfigBase {
  name: string;
  type: 'config'; 
  subType: 'mapping_template';
}

interface CategorizationRule extends ConfigBase {
    keyword: string; // Trefwoord in omschrijving
    category: string; // Nieuwe categorie
    newDescription?: string; // Nieuwe omschrijving
    type: 'config';
    subType: 'rule';
}

interface AccountNameRecord extends ConfigBase {
    id: string; // vast ID voor dit record
    names: Record<string, string>;
    type: 'config';
    subType: 'account_names';
}

interface ManualCategoryRecord extends ConfigBase {
    id: string; // vast ID
    categories: string[];
    type: 'config';
    subType: 'manual_categories';
}

type Period = '1M' | '6M' | '1Y' | 'ALL';

// --- API Service Logic ---
class ApiService {
    private config: ApiConfig = { url: '', token: '', username: '', endpointName: 'finance-data' };
    private apiBaseUrl = ''; 
    private transactionType = 'transaction';
    private configType = 'config';

    constructor(initialConfig: ApiConfig) {
        this.config = initialConfig;
        this.updateBaseUrl(); 
    }
    
    // NIEUW: Functie om in te loggen en het JWT token op te halen
    async login(url: string, username: string, password?: string): Promise<string> {
        if (!password) {
            throw new Error('Wachtwoord is verplicht om in te loggen.');
        }
        
        const loginUrl = `${url}/login/auth`;
        
        // --- API CALL ---
        const headers = { 'Content-Type': 'application/json' };
        const options: RequestInit = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ username, password }),
            mode: 'cors'
        };

        const response = await fetch(loginUrl, options);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Aanmelden Mislukt (${response.status}): ${errorText.substring(0, 150)}`);
        }

        const result = await response.json();
        if (!result.token) {
            throw new Error('Aanmelden Mislukt: Geen token ontvangen.');
        }
        
        return result.token;
    }


    private updateBaseUrl() {
        if (this.config.url && this.config.endpointName) {
            this.apiBaseUrl = `${this.config.url}/api/${this.config.endpointName}`; 
        } else {
            this.apiBaseUrl = '';
        }
    }

    public updateConfig(newConfig: ApiConfig) {
        this.config = newConfig;
        this.updateBaseUrl();
        // Sla alleen de benodigde velden op (niet het wachtwoord!)
        const configToStore = {
            url: newConfig.url,
            token: newConfig.token,
            username: newConfig.username,
            endpointName: newConfig.endpointName
        };
        localStorage.setItem('apiConfig', JSON.stringify(configToStore));
    }
    
    public getConfig(): ApiConfig {
        return this.config;
    }

    private async callApi(url: string, method: string, data: any = null): Promise<any> {
        // GEWIJZIGD: Controleer of token bestaat, niet of het lang genoeg is (de login regelt dit)
        if (!this.config.url || !this.config.token || !this.apiBaseUrl) {
            throw new Error('API URL, Endpoint Naam, of Token is niet ingesteld.');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.token}`,
            'Access-Control-Allow-Origin': '*'
        };

        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const options: RequestInit = {
                    method: method,
                    headers: headers,
                    body: data ? JSON.stringify(data) : null,
                    mode: 'cors'
                };

                const response = await fetch(url, options);

                if (response.status === 429) {
                    if (attempt < maxRetries - 1) {
                        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                        await new Promise(res => setTimeout(res, delay));
                        continue;
                    }
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Fout (${response.status}): ${errorText.substring(0, 150)}`);
                }
                
                if (method === 'DELETE') return { status: 'deleted' };

                return response.json();
            } catch (e) {
                if (attempt === maxRetries - 1) throw e;
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }
    
    // De API stuurt een lijst met objecten terug, elk met een 'id' en 'data' veld.
    async getTransactions<T>(): Promise<T[]> {
        const url = `${this.apiBaseUrl}?type=${this.transactionType}`;
        const result: { id: string, data: T }[] = await this.callApi(url, 'GET');
        return result.map(item => ({...item.data, id: item.id}));
    }
    
    async getConfigItems<T>(subType: string): Promise<T[]> {
        const url = `${this.apiBaseUrl}?type=${this.configType}&subType=${subType}`; 
        const result: { id: string, data: T }[] = await this.callApi(url, 'GET');
        return result.map(item => ({...item.data, id: item.id}));
    }

    async addItem<T>(item: T): Promise<T> {
        const dataToSend = { ...item };
        if ((dataToSend as any).id) delete (dataToSend as any).id;
        
        const result: { id: string, data: T } = await this.callApi(this.apiBaseUrl, 'POST', dataToSend);
        return { ...result.data, id: result.id };
    }

    async updateItem<T extends { id: string }>(item: T): Promise<T> {
        const id = item.id;
        const url = `${this.apiBaseUrl}/${id}`;
        
        const dataToSend = { ...item };
        delete (dataToSend as any).id; 
        
        const result: { id: string, data: T } = await this.callApi(url, 'PUT', dataToSend);
        return { ...result.data, id: result.id };
    }
    
    async deleteItem(id: string): Promise<void> {
        const url = `${this.apiBaseUrl}/${id}`;
        await this.callApi(url, 'DELETE');
    }
    
    async deleteBulk(type: 'transaction' | 'config'): Promise<void> {
        const url = `${this.apiBaseUrl}?type=${type}`;
        await this.callApi(url, 'DELETE');
    }
}
// Einde ApiService

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, CurrencyPipe, DecimalPipe],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500 selection:text-white pb-20">
      
      <!-- Navbar -->
      <nav class="border-b border-gray-800 bg-gray-950/50 backdrop-blur fixed top-0 w-full z-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center gap-2">
              <div class="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span class="font-bold text-xl tracking-tight hidden sm:block">MijnFinanciën</span>
              <span *ngIf="apiConfig().url" class="text-xs text-gray-500 ml-4 hidden sm:block">
                 API: {{ apiConfig().endpointName }} op {{ apiConfig().url | slice:7:30 }}... | Gebruiker: {{ apiConfig().username }}
              </span>
            </div>
            
            <div class="flex space-x-1 sm:space-x-2">
              <button *ngFor="let tab of tabs"
                (click)="activeTab.set(tab.id)"
                [class]="activeTab() === tab.id ? 'bg-gray-800 text-blue-400 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
                class="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap">
                {{ tab.label }}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
        
        <!-- === API CONNECTION SETUP VIEW === -->
        <div *ngIf="!apiConfig().token && activeTab() !== 'settings'" class="p-8 bg-yellow-900/50 border border-yellow-700 rounded-xl shadow-xl text-center mb-8">
            <h3 class="text-2xl font-bold text-yellow-300 mb-2">API Verbinding Vereist</h3>
            <p class="text-yellow-400 mb-4">Om de applicatie te gebruiken, moet je eerst de URL, **Endpoint Naam**, **Gebruikersnaam** en **Wachtwoord** instellen op het tabblad "Beheer".</p>
            <button (click)="activeTab.set('settings')" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              Ga naar Instellingen
            </button>
        </div>
        
        <!-- Toon laadstatus overal behalve Settings -->
        <div *ngIf="isLoading() && activeTab() !== 'settings'" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
            <div class="flex flex-col items-center p-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                <p class="text-lg font-semibold text-white">Laden...</p>
                <p class="text-sm text-gray-500 mt-1">{{ loadingMessage() }}</p>
            </div>
        </div>

        
        <!-- === DASHBOARD VIEW === -->
        <div *ngIf="activeTab() === 'dashboard'" class="animate-fade-in space-y-8">
          <div>
            <h2 class="text-2xl font-bold mb-4">Financieel Dashboard</h2>
            
            <!-- Cards -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-colors">
                <div class="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <svg class="w-24 h-24 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                </div>
                <p class="text-gray-400 text-sm font-medium uppercase tracking-wider">Inkomsten (Dit Jaar)</p>
                <p class="text-3xl font-bold text-green-400 mt-2">{{ totalStats().income | currency:'EUR':'symbol':'1.0-0' }}</p>
              </div>
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-colors">
                <div class="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <svg class="w-24 h-24 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                </div>
                <p class="text-gray-400 text-sm font-medium uppercase tracking-wider">Uitgaven (Dit Jaar)</p>
                <p class="text-3xl font-bold text-red-400 mt-2">{{ totalStats().expense | currency:'EUR':'symbol':'1.0-0' }}</p>
              </div>
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-colors">
                <div class="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <svg class="w-24 h-24 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
                </div>
                <p class="text-gray-400 text-sm font-medium uppercase tracking-wider">Netto Resultaat</p>
                <p class="text-3xl font-bold mt-2" [ngClass]="{'text-green-400': totalStats().balance >= 0, 'text-red-400': totalStats().balance < 0}">
                  {{ totalStats().balance | currency:'EUR':'symbol':'1.0-0' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Pivot Table -->
          <div class="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
            <div class="p-4 sm:p-6 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 class="text-lg font-semibold text-white">Categorie Overzicht</h3>
              
              <!-- Dashboard Navigation Controls -->
              <div class="flex items-center bg-gray-900 rounded-lg p-1 border border-gray-700">
                <button (click)="moveDashboard(-1)" class="p-2 hover:bg-gray-800 rounded-md text-gray-400 hover:text-white transition-colors">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <span class="px-2 sm:px-4 text-xs sm:text-sm font-mono font-medium text-gray-300 border-x border-gray-800 min-w-[140px] text-center">
                  {{ matrixData().months[5] | date:'MMM yyyy' }} - {{ matrixData().months[0] | date:'MMM yyyy' }}
                </span>
                <button (click)="moveDashboard(1)" class="p-2 hover:bg-gray-800 rounded-md text-gray-400 hover:text-white transition-colors">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
              </div>
            </div>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr class="bg-gray-900/50 text-gray-400 border-b border-gray-700">
                    <th class="p-4 font-medium sticky left-0 bg-gray-900 z-10 border-r border-gray-700 min-w-[120px]">Categorie</th>
                    <th *ngFor="let m of matrixData().months" class="p-4 font-medium text-right min-w-[80px] sm:min-w-[100px]">
                      {{ m | date:'MMM yy' }}
                    </th>
                    <th class="p-4 font-medium text-right bg-gray-900/30 border-l border-gray-700 text-white min-w-[100px]">Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let cat of matrixData().categories" class="border-b border-gray-700 hover:bg-gray-700/30 transition-colors">
                    <td class="p-4 font-medium text-gray-300 sticky left-0 bg-gray-800 border-r border-gray-700 flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full flex-shrink-0" [style.background-color]="getCategoryColor(cat)"></span>
                      <span class="truncate">{{ cat }}</span>
                    </td>
                    <td *ngFor="let m of matrixData().months" class="p-4 text-right font-mono text-gray-400">
                      <span [class.text-gray-600]="getMatrixValue(cat, m) === 0" [class.text-gray-300]="getMatrixValue(cat, m) !== 0">
                         {{ getMatrixValue(cat, m) !== 0 ? (getMatrixValue(cat, m) | currency:'EUR':'symbol':'1.0-0') : '-' }}
                      </span>
                    </td>
                    <td class="p-4 text-right font-bold text-white bg-gray-900/20 border-l border-gray-700 font-mono">
                      {{ getMatrixRowTotal(cat) | currency:'EUR':'symbol':'1.0-0' }}
                    </td>
                  </tr>
                  <!-- Totalen Rij -->
                  <tr class="bg-gray-900 font-bold border-t-2 border-gray-600">
                    <td class="p-4 sticky left-0 bg-gray-900 border-r border-gray-700 text-blue-400">Totaal p/mnd</td>
                    <td *ngFor="let m of matrixData().months" class="p-4 text-right font-mono"
                        [ngClass]="getMonthTotal(m) >= 0 ? 'text-green-400' : 'text-red-400'">
                      {{ getMonthTotal(m) | currency:'EUR':'symbol':'1.0-0' }}
                    </td>
                    <td class="p-4 bg-gray-900 border-l border-gray-700"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- === STATISTICS VIEW === -->
        <div *ngIf="activeTab() === 'stats'" class="animate-fade-in space-y-8">
          
          <!-- Controls -->
          <div class="flex flex-wrap justify-between items-center bg-gray-800 p-4 rounded-xl border border-gray-700">
            <h2 class="text-xl font-bold mb-2 sm:mb-0">Statistieken</h2>
            <div class="flex bg-gray-900 p-1 rounded-lg">
              <button *ngFor="let p of periods" 
                (click)="statsPeriod.set(p); reloadData()"
                [class]="statsPeriod() === p ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'"
                class="px-3 py-1.5 text-sm font-medium rounded-md transition-all">
                {{ p }}
              </button>
            </div>
          </div>

          <!-- Charts Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            <!-- 1. Balans Verloop (Line Chart) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg lg:col-span-2">
              <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                <span class="w-2 h-6 bg-blue-500 rounded-full"></span>
                Balans Verloop (Groepeert per {{ statsPeriod() === '1M' ? 'Dag' : (statsPeriod() === '6M' ? 'Week' : 'Maand') }})
              </h3>
              <div class="h-64 w-full relative group">
                <!-- SVG Line Chart -->
                <svg class="w-full h-full overflow-visible" preserveAspectRatio="none">
                  <!-- Grid Lines -->
                  <line x1="0" y1="0%" x2="100%" y2="0%" stroke="#374151" stroke-dasharray="4" />
                  <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#374151" stroke-dasharray="4" />
                  <line x1="0" y1="100%" x2="100%" y2="100%" stroke="#374151" stroke-dasharray="4" />
                  
                  <!-- The Line -->
                  <polyline 
                    [attr.points]="lineChartPoints()" 
                    fill="none" 
                    stroke="#3B82F6" 
                    stroke-width="3" 
                    vector-effect="non-scaling-stroke"
                    class="drop-shadow-lg"
                  />
                  <!-- Dots -->
                  <circle *ngFor="let point of lineChartData()" 
                    [attr.cx]="point.x + '%'" 
                    [attr.cy]="point.y + '%'" 
                    r="4" 
                    class="fill-blue-500 stroke-gray-800 stroke-2 hover:r-6 transition-all cursor-pointer"
                  >
                    <title>{{ point.label }}: {{ point.value | currency:'EUR' }}</title>
                  </circle>
                </svg>
                <!-- Labels X-axis -->
                <div class="flex justify-between mt-2 text-xs text-gray-500 overflow-hidden h-6">
                    <span *ngFor="let point of lineChartData(); let i = index" 
                      [ngStyle]="{'width': (100 / (lineChartData().length - 1 || 1)) + '%'}"
                      class="text-center truncate"
                    >
                       <span *ngIf="shouldShowLabel(i, lineChartData().length, statsPeriod())" class="block w-full -ml-[50%]">{{ point.label }}</span>
                    </span>
                </div>
              </div>
            </div>

            <!-- 2. Uitgaven per Categorie (Pie Chart) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg flex flex-col">
              <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                <span class="w-2 h-6 bg-purple-500 rounded-full"></span>
                Verdeling Categorieën (Uitgaven)
              </h3>
              <div class="flex-1 flex flex-col sm:flex-row items-center justify-center gap-8">
                <!-- Pie using Conic Gradient -->
                <div class="relative w-40 h-40 sm:w-48 sm:h-48 rounded-full shadow-2xl flex-shrink-0" 
                     [style.background]="getPieGradient()">
                     <div class="absolute inset-2 sm:inset-4 bg-gray-800 rounded-full flex items-center justify-center flex-col">
                        <span class="text-xs text-gray-400">Totaal</span>
                        <span class="font-bold text-white text-lg">{{ pieTotal() | currency:'EUR':'symbol':'1.0-0' }}</span>
                     </div>
                </div>
                <!-- Legend -->
                <div class="space-y-2 text-sm max-h-48 overflow-y-auto custom-scrollbar pr-2 w-full sm:w-auto">
                  <div *ngFor="let item of pieChartData()" class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background-color]="item.color"></span>
                    <span class="text-gray-300 flex-1 truncate">{{ item.label }}</span>
                    <span class="font-mono text-gray-400">{{ item.percentage }}%</span>
                  </div>
                </div>
              </div>
            </div>
            
             <!-- 3. Uitgaven per Categorie (Bar Chart) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
               <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                <span class="w-2 h-6 bg-red-500 rounded-full"></span>
                Uitgaven per Categorie (Top)
              </h3>
              
              <div class="flex h-64 gap-2">
                <!-- Y-Axis Scale (New) -->
                <div class="flex flex-col justify-between text-xs text-gray-500 w-12 text-right pr-2 border-r border-gray-700 h-full py-1">
                   <span class="font-mono">{{ getBarMax() | currency:'EUR':'symbol':'1.0-0' }}</span>
                   <span class="font-mono">{{ getBarMax() / 2 | currency:'EUR':'symbol':'1.0-0' }}</span>
                   <span class="font-mono">0</span>
                </div>

                <!-- Bars Container -->
                <div class="flex-1 flex items-end justify-between gap-2 h-full pb-1 overflow-x-auto">
                  <div *ngFor="let item of barChartData()" class="flex-shrink-0 w-16 sm:w-20 flex flex-col items-center group h-full justify-end">
                    
                    <!-- Bar with explicit height style logic -->
                    <div class="w-full rounded-t-sm relative transition-all duration-300 hover:opacity-80" 
                         [style.height.%]="item.pct"
                         [style.background-color]="item.color">
                         
                         <!-- Tooltip -->
                         <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none transition-opacity border border-gray-600">
                           {{ item.label }}: {{ item.value | currency:'EUR':'symbol':'1.0-0' }}
                         </div>
                    </div>
                    
                    <!-- Rotating labels for readability on small screens -->
                    <span class="text-xs text-gray-500 mt-2 transform rotate-45 sm:rotate-0 origin-left truncate w-full text-center min-h-[1.25rem] whitespace-nowrap" [title]="item.label">
                      {{ item.label.length > 8 ? item.label.slice(0,6) + '..' : item.label }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 4. Uitschieters (Trends/Afwijkingen) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg lg:col-span-2">
                <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                    <span class="w-2 h-6 bg-yellow-500 rounded-full"></span>
                    Opvallende Afwijkingen (t.o.v. laatste 3 maanden)
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div *ngIf="trendAnalysis().high.length > 0" class="space-y-3 bg-gray-900 p-4 rounded-lg border border-gray-700">
                        <h4 class="font-bold text-red-400 flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            Grote Stijgers (Meer dan 20%)
                        </h4>
                        <div *ngFor="let item of trendAnalysis().high" class="flex justify-between text-sm">
                            <span class="text-gray-300 font-medium">{{ item.category }}</span>
                            <span class="font-mono text-red-300">{{ item.diff | currency:'EUR':'symbol':'1.0-0' }} <span class="text-xs">({{ item.pctChange }}%)</span></span>
                        </div>
                    </div>
                    
                    <div *ngIf="trendAnalysis().low.length > 0" class="space-y-3 bg-gray-900 p-4 rounded-lg border border-gray-700">
                         <h4 class="font-bold text-green-400 flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path></svg>
                            Grote Dalers/Besparingen
                        </h4>
                        <div *ngFor="let item of trendAnalysis().low" class="flex justify-between text-sm">
                            <span class="text-gray-300 font-medium">{{ item.category }}</span>
                            <span class="font-mono text-green-300">{{ item.diff | currency:'EUR':'symbol':'1.0-0' }} <span class="text-xs">({{ item.pctChange }}%)</span></span>
                        </div>
                    </div>

                    <p *ngIf="trendAnalysis().low.length === 0 && trendAnalysis().high.length === 0" class="text-gray-500 italic p-4 col-span-2 text-center">
                        Geen opvallende afwijkingen gevonden vergeleken met het gemiddelde van de afgelopen 3 maanden.
                    </p>
                </div>
            </div>
            
          </div>
        </div>

        <!-- === RULES & CATEGORY MANAGEMENT VIEW === -->
        <div *ngIf="activeTab() === 'rules'" class="animate-fade-in max-w-4xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">Regels & Categorie Beheer</h2>

            <!-- Categorization Rules -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                <h3 class="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                  <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                  Automatische Categorisatie Regels
                </h3>
                <p class="text-gray-400 text-sm mb-6">Transacties waarvan de omschrijving het trefwoord bevat, krijgen automatisch de gekozen categorie en/of omschrijving.</p>

                <!-- New Rule Input -->
                <div class="flex flex-col gap-4 mb-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <input type="text" [(ngModel)]="newRule.keyword" placeholder="Trefwoord (bv. Netflix, AH)" class="col-span-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-blue-500 focus:outline-none" />
                        
                        <select [(ngModel)]="newRule.category" class="col-span-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer">
                            <option value="" disabled selected>Kies Categorie</option>
                            <!-- UPDATED: Use allCategories which includes temporary categories -->
                            <option *ngFor="let cat of allCategories()" [value]="cat">{{ cat }}</option>
                        </select>

                        <button (click)="addRule()" class="col-span-1 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition-colors flex-shrink-0" [disabled]="!apiConfig().token">Regel Toevoegen</button>
                    </div>

                    <input type="text" [(ngModel)]="newRule.newDescription" placeholder="Optioneel: Nieuwe omschrijving (laat leeg om te behouden)" class="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>

                <!-- Rules List -->
                <div class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    <div *ngFor="let rule of categorizationRules()" class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-900 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-colors">
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm mb-2 sm:mb-0">
                            <span class="text-gray-300 font-mono font-bold">"{{ rule.keyword }}"</span>
                            <span class="text-gray-500 hidden sm:block">→</span>
                            <span class="px-2 py-1 rounded-md text-xs font-bold text-white border border-white/10"
                                [style.background-color]="getCategoryColor(rule.category) + '80'"
                                [style.border-color]="getCategoryColor(rule.category)">
                                {{ rule.category }}
                            </span>
                            <span *ngIf="rule.newDescription" class="text-gray-400 text-xs italic mt-1 sm:mt-0">
                                (Omschrijving: "{{ rule.newDescription }}")
                            </span>
                        </div>
                        
                        <div class="flex gap-2 flex-shrink-0">
                            <button (click)="applyRuleToExisting(rule)" class="text-blue-400 hover:text-blue-300 p-1 rounded transition-colors text-xs font-medium border border-blue-600/50 hover:bg-blue-900/50 px-2 py-1" [disabled]="!apiConfig().token">
                                Pas toe op bestaande
                            </button>
                            <button (click)="deleteRule(rule.id)" class="text-red-400 hover:text-red-300 p-1 rounded transition-colors" title="Verwijder regel" [disabled]="!apiConfig().token">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                    <p *ngIf="categorizationRules().length === 0" class="text-center text-gray-500 p-4 border border-dashed border-gray-700 rounded-lg">Nog geen regels ingesteld.</p>
                </div>
            </div>

            <!-- Category Management -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
                <h3 class="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                    <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm4 14h2m-2-4h2m-4 0v4m4-4h.01M17 3h5a2 2 0 012 2v6a2 2 0 01-2 2h-5a2 2 0 01-2-2V5a2 2 0 012-2z"></path></svg>
                    Categorieën & Accounts Beheren
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Categorie Rename/Delete/ADD -->
                    <div class="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-3">
                        <h4 class="text-sm font-semibold text-gray-300 mb-2">Aanwezige Categorieën</h4>
                        
                        <!-- New Category Input -->
                        <div class="flex gap-2">
                            <input type="text" [(ngModel)]="newCategoryName" placeholder="Nieuwe categorie naam" class="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm focus:ring-blue-500">
                            <button (click)="addManualCategory()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex-shrink-0" [disabled]="!apiConfig().token">Voeg toe</button>
                        </div>

                        <!-- List -->
                        <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pt-2">
                            <div *ngFor="let cat of manualCategories()" class="flex justify-between items-center text-sm p-1 hover:bg-gray-700/50 rounded">
                                <div class="flex items-center gap-2">
                                    <span class="w-3 h-3 rounded-full flex-shrink-0" [style.background-color]="getCategoryColor(cat)"></span>
                                    <span class="text-gray-300 truncate">{{ cat }}</span>
                                </div>
                                <div class="flex gap-1">
                                    <button (click)="renameCategory(cat)" class="text-blue-400 hover:text-blue-300 p-1" title="Hernoem" [disabled]="!apiConfig().token">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L15.232 5.232z"></path></svg>
                                    </button>
                                    <button (click)="deleteManualCategory(cat)" class="text-red-400 hover:text-red-300 p-1" title="Verwijder" [disabled]="!apiConfig().token">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Account Names -->
                    <div class="bg-gray-900 p-4 rounded-lg border border-gray-700 space-y-3">
                        <h4 class="text-sm font-semibold text-gray-300">Rekeningen Namen (Optioneel)</h4>
                        <p class="text-xs text-gray-500 mb-2">Geef een vriendelijke naam aan de rekeningnummers.</p>
                        <div *ngFor="let acc of uniqueAccountNumbers()" class="flex items-center gap-2 mb-2">
                           <span class="text-gray-400 font-mono text-xs w-24 flex-shrink-0">{{ acc }}</span>
                           <input type="text" 
                                  [ngModel]="getAccountName(acc)"
                                  (ngModelChange)="setAccountName(acc, $event)"
                                  placeholder="Naam (bv. Betaalrekening)"
                                  class="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm focus:ring-blue-500"
                                  [disabled]="!apiConfig().token">
                        </div>
                        <button (click)="saveAccountNames()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors flex-shrink-0" [disabled]="!apiConfig().token">Namen Opslaan</button>
                    </div>
                </div>
            </div>
            
             <!-- Gevaarzone (NIEUW: Wisknop) -->
            <div class="bg-red-900/30 p-6 rounded-xl border border-red-700 shadow-lg mt-8">
                <h3 class="text-xl font-semibold text-red-300 mb-2">Gevaarzone</h3>
                <p class="text-red-400 text-sm mb-4">
                    Deze actie kan niet ongedaan worden gemaakt.
                </p>
                <button (click)="deleteAllTransactions()" 
                        class="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                        [disabled]="!apiConfig().token">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Alle Transacties Wissen
                </button>
            </div>
        </div>


        <!-- === TRANSACTIONS VIEW === -->
        <div *ngIf="activeTab() === 'transactions'" class="animate-fade-in space-y-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 class="text-2xl font-bold">Transacties</h2>
            <div class="flex gap-2">
              <button *ngIf="filteredTransactions().length > 0" (click)="exportFilteredCsv()" 
                  class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-gray-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Export ({{filteredTransactions().length}})
              </button>
              <button *ngIf="filteredTransactions().length > 0" (click)="openBulkEdit()" 
                 class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-gray-600"
                 [disabled]="!apiConfig().token">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.414 2.586a2 2 0 00-2.828 0L7 9.414V13h3.586l6.828-6.828a2 2 0 000-2.828z" />
                  <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                </svg>
                Bulk Bewerk
              </button>
              <button (click)="openModal()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                      [disabled]="!apiConfig().token">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                </svg>
                Nieuw
              </button>
            </div>
          </div>

          <!-- Filters -->
          <div class="grid grid-cols-2 md:grid-cols-6 gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm">
            <div class="relative col-span-2 md:col-span-2">
               <svg class="absolute left-3 top-3 h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
               <input 
                type="text" 
                placeholder="Zoek omschrijving/cat/tag..." 
                [ngModel]="searchTerm()" 
                (ngModelChange)="searchTerm.set($event)"
                class="w-full bg-gray-900 border border-gray-600 text-white rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
            </div>
            
            <select [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)" class="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer text-sm">
              <option value="ALL">Alle Categorieën</option>
              <option *ngFor="let cat of allCategories()" [value]="cat">{{ cat }}</option>
            </select>

            <select [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)" class="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer text-sm">
              <option value="ALL">Alle Types</option>
              <option value="income">Inkomsten</option>
              <option value="expense">Uitgaven</option>
            </select>
            
            <select [ngModel]="accountFilter()" (ngModelChange)="accountFilter.set($event)" class="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer text-sm">
                <option value="ALL">Alle Rekeningen</option>
                <option *ngFor="let acc of uniqueAccountNumbers()" [value]="acc">{{ getAccountName(acc) }}</option>
            </select>
            
            <!-- AANGEPAST: Datumfilters op één rij, nemen nu 2 kolommen in beslag. -->
            <div class="col-span-2 md:col-span-2 grid grid-cols-2 gap-4">
                <div class="relative">
                    <label class="block text-xs font-medium text-gray-400 mb-1">Vanaf</label>
                    <input type="date" [ngModel]="dateFromFilter()" (ngModelChange)="dateFromFilter.set($event)" placeholder="Datum Vanaf" class="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
                </div>
                <div class="relative">
                    <label class="block text-xs font-medium text-gray-400 mb-1">Tot</label>
                    <input type="date" [ngModel]="dateToFilter()" (ngModelChange)="dateToFilter.set($event)" placeholder="Datum Tot" class="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
                </div>
            </div>
            <!-- EINDE AANPASSING -->
          </div>

          <!-- List -->
          <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="bg-gray-900/50 text-gray-400 border-b border-gray-700 text-xs uppercase tracking-wider whitespace-nowrap">
                  <tr>
                    <th class="p-3 font-semibold">Datum</th>
                    <th class="p-3 font-semibold">Rekening</th>
                    <th class="p-3 font-semibold">Omschrijving</th>
                    <th class="p-3 font-semibold">Categorie</th>
                    <th class="p-3 font-semibold">Tags</th>
                    <th class="p-3 font-semibold text-right">Bedrag</th>
                    <th class="p-3 font-semibold text-right">Saldo</th>
                    <th class="p-3 font-semibold text-right min-w-[70px]">Actie</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                  <tr *ngFor="let t of filteredTransactions()" class="group hover:bg-gray-700/50 transition-colors text-sm">
                    <td class="p-3 text-gray-300 whitespace-nowrap font-mono text-xs">{{ t.date | date:'dd-MM-yyyy' }}</td>
                    <td class="p-3 text-gray-400 text-xs whitespace-nowrap" [title]="t.accountNumber || ''">{{ getAccountName(t.accountNumber) }}</td>
                    <td class="p-3 font-medium text-white max-w-[200px] truncate">{{ t.description }}</td>
                    <td class="p-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold text-white border border-white/10" 
                            [style.background-color]="getCategoryColor(t.category) + '80'" 
                            [style.border-color]="getCategoryColor(t.category)">
                        {{ t.category }}
                      </span>
                    </td>
                    <td class="p-3 text-gray-400 text-xs whitespace-nowrap">
                        <span *ngFor="let tag of t.tags" class="inline-block bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-xs mr-1">
                            #{{ tag }}
                        </span>
                        <span *ngIf="!t.tags?.length">-</span>
                    </td>
                    <td class="p-3 text-right font-mono font-bold" 
                        [ngClass]="t.type === 'income' ? 'text-green-400' : 'text-red-400'">
                      <!-- OPGELOST: Expliciete locale 'nl' verwijderd, valt terug op default locale -->
                      {{ (t.type === 'income' ? '+' : '-') }} {{ t.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </td>
                    <td class="p-3 text-right font-mono text-gray-400 text-xs">
                      <!-- OPGELOST: Expliciete locale 'nl' verwijderd, valt terug op default locale -->
                      {{ t.currentBalance ? (t.currentBalance | currency:'EUR':'symbol':'1.2-2') : '-' }}
                    </td>
                    <td class="p-3 text-right">
                      <div class="flex justify-end gap-2 opacity-100 transition-opacity whitespace-nowrap">
                         <button (click)="$event.stopPropagation(); openModal(t)" class="p-1 hover:bg-blue-900/50 rounded text-blue-400 cursor-pointer" title="Bewerken"
                                 [disabled]="!apiConfig().token">
                           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                         </button>
                         <button (click)="$event.stopPropagation(); deleteTransaction(t.id)" class="p-1 hover:bg-red-900/50 rounded text-red-400 cursor-pointer" title="Verwijderen"
                                 [disabled]="!apiConfig().token">
                           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                         </button>
                      </div>
                    </td>
                  </tr>
                  <tr *ngIf="filteredTransactions().length === 0">
                    <td colspan="8" class="p-12 text-center">
                       <div class="flex flex-col items-center justify-center text-gray-500">
                         <svg class="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                         <p>Geen transacties gevonden.</p>
                       </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- === SETTINGS / IMPORT / EXPORT VIEW === -->
        <div *ngIf="activeTab() === 'settings'" class="animate-fade-in max-w-2xl mx-auto space-y-6">
          <h2 class="text-2xl font-bold mb-6">Data Beheer</h2>
          
          <!-- API Configuration Card (NIEUW) -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg space-y-4">
            <h3 class="text-lg font-semibold text-white flex items-center gap-2">
               <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2v4a2 2 0 01-2 2h-2m-3 4h.01M3 12L3 4m0 0l4 4m-4-4l4-4M19 18v-4m0 0v-4m0 4h-4m4 0h4m-4 0v4m0-4v-4m-4 0h-4"></path></svg>
               API Gateway Instellingen
            </h3>
            
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">API URL (Inclusief poort 8080)</label>
                <input type="url" [(ngModel)]="newApiConfig.url" placeholder="http://mijn-server-ip:8080" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
              </div>
              <!-- NIEUW VELD: Endpoint Naam -->
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Unieke Endpoint Naam (aangemaakt in dashboard)</label>
                <input type="text" [(ngModel)]="newApiConfig.endpointName" placeholder="bv. finance-app-v1" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
              </div>
              <!-- GEWIJZIGD: Invoer voor Gebruikersnaam -->
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Gebruikersnaam</label>
                <input type="text" [(ngModel)]="newApiConfig.username" placeholder="Gebruikersnaam" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
              </div>
              <!-- NIEUW: Invoer voor Wachtwoord (voor Login) -->
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Wachtwoord</label>
                <input type="password" [(ngModel)]="newApiConfig.password" placeholder="Wachtwoord" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-sm">
              </div>
              
              <div *ngIf="apiConfig().token" class="text-sm text-gray-500 p-2 border border-gray-700 rounded-lg break-all">
                  <span class="text-green-400 font-bold">Token verkregen.</span> Verlooptijd van Token wordt beheerd door de API.
              </div>
            </div>
            
            <button (click)="saveApiConfig()" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full">
              Inloggen & Data Synchroniseren
            </button>
            <div *ngIf="apiConfig().token" class="text-sm text-green-400 mt-2 text-center">
                Verbonden: Transacties worden nu opgeslagen via de API.
            </div>
          </div>
          
          <!-- CSV Import Card -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg relative overflow-hidden">
             <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
             <h3 class="text-lg font-semibold mb-4 text-white flex items-center gap-2 relative z-10">
               <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
               CSV Importeren
             </h3>
             <p class="text-gray-400 mb-6 text-sm">Upload een bank CSV. Je kunt daarna kiezen welke kolommen we moeten gebruiken.</p>
             
             <div class="flex items-center justify-center w-full">
                <label for="dropzone-file" class="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-700/30 hover:bg-gray-700/50 hover:border-blue-500 transition-all">
                    <div class="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg class="w-8 h-8 mb-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p class="text-sm text-gray-400"><span class="font-semibold text-blue-400">Klik om te uploaden</span></p>
                        <p class="text-xs text-gray-500 mt-1">CSV (max. 5MB)</p>
                    </div>
                    <input id="dropzone-file" type="file" class="hidden" (change)="handleCsvFile($event)" accept=".csv" />
                </label>
            </div>
          </div>

          <!-- JSON Backup Card -->
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg relative overflow-hidden">
             <div class="flex flex-col sm:flex-row gap-4">
                <div class="flex-1">
                  <h3 class="text-lg font-semibold mb-2 text-white">Backup Maken (Lokaal)</h3>
                  <p class="text-xs text-gray-400 mb-4">Download al je data als JSON bestand.</p>
                  <button (click)="exportData()" class="text-sm bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg border border-gray-600 w-full transition-colors">Download</button>
                </div>
                <div class="w-px bg-gray-700 hidden sm:block"></div>
                <div class="flex-1">
                   <h3 class="text-lg font-semibold mb-2 text-white">Backup Herstellen (Lokaal)</h3>
                   <p class="text-xs text-gray-400 mb-4">Overschrijft huidige data!</p>
                   <input type="file" (change)="importJson($event)" class="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer"/>
                </div>
             </div>
          </div>
          
          <div class="mt-8 text-center">
            <button (click)="loadDummyData()" class="text-sm text-gray-500 hover:text-blue-400 underline" [disabled]="!apiConfig().token">
              Reset & Laad voorbeeld data (API)
            </button>
          </div>
        </div>

      </main>

      <!-- === MODALS === -->

      <!-- 1. Transaction Modal -->
      <div *ngIf="showModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
          <div class="fixed inset-0 bg-gray-950 bg-opacity-90 transition-opacity backdrop-blur-sm" (click)="closeModal()"></div>

          <div class="inline-block align-bottom bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-gray-700">
            <div class="px-6 py-5 border-b border-gray-700 bg-gray-800/50">
              <h3 class="text-lg font-bold leading-6 text-white">
                {{ isEditing ? 'Transactie Bewerken' : 'Nieuwe Transactie' }}
              </h3>
            </div>
            <div class="px-6 py-6 space-y-5">
                <!-- Type Toggle -->
                <div>
                  <label class="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Transactie Type</label>
                  <div class="grid grid-cols-2 gap-2 p-1 bg-gray-900 rounded-lg">
                    <button type="button" (click)="currentTransaction.type = 'expense'" 
                      [class]="currentTransaction.type === 'expense' ? 'bg-red-500 text-white shadow' : 'text-gray-400 hover:text-white'"
                      class="flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all">
                      Uitgave
                    </button>
                    <button type="button" (click)="currentTransaction.type = 'income'"
                      [class]="currentTransaction.type === 'income' ? 'bg-green-500 text-white shadow' : 'text-gray-400 hover:text-white'"
                      class="flex items-center justify-center py-2 text-sm font-medium rounded-md transition-all">
                      Inkomsten
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Omschrijving</label>
                  <input type="text" 
                    [(ngModel)]="currentTransaction.description" 
                    (ngModelChange)="applyRulesToNewDescription($event)"
                    class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="Bijv. Albert Heijn">
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                       <label class="block text-sm font-medium text-gray-400 mb-1">Rekening (Optioneel)</label>
                       <input type="text" [(ngModel)]="currentTransaction.accountNumber" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="NL01BANK...">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-400 mb-1">Saldo na Tx (Optioneel)</label>
                        <input type="number" [(ngModel)]="currentTransaction.currentBalance" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="0.00">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Bedrag (€)</label>
                    <input type="number" [(ngModel)]="currentTransaction.amount" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="0.00">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Datum</label>
                    <input type="date" [(ngModel)]="currentTransaction.date" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow">
                  </div>
                </div>

                <!-- Tags Input (NIEUW) -->
                <div>
                   <label class="block text-sm font-medium text-gray-400 mb-1">Tags (Kommagescheiden, bijv. vakantie, zakelijk)</label>
                   <input type="text" 
                       [ngModel]="currentTransaction.tags?.join(', ') || ''" 
                       (ngModelChange)="handleTagInput($event)"
                       class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" 
                       placeholder="#vakantie #zakelijk">
                </div>

                <!-- Fixed Categorie Selectie (Dropdown + Input) -->
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Categorie</label>
                  <div class="space-y-2">
                      <select 
                        [ngModel]="isNewCategoryMode ? '__NEW__' : currentTransaction.category" 
                        (ngModelChange)="handleCategoryChange($event)"
                        class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer">
                          <option *ngFor="let cat of allCategories()" [value]="cat">{{ cat }}</option>
                          <option disabled>──────────</option>
                          <option value="__NEW__" class="text-blue-400 font-bold">+ Nieuwe Categorie...</option>
                      </select>
                      
                      <!-- Toon alleen als 'Nieuwe Categorie' is gekozen -->
                      <div *ngIf="isNewCategoryMode" class="animate-fade-in relative">
                         <input type="text" [(ngModel)]="currentTransaction.category" 
                                class="w-full bg-gray-800 border border-blue-500 rounded-lg px-4 py-2.5 text-white focus:outline-none" 
                                placeholder="Typ nieuwe categorie naam...">
                         <button (click)="isNewCategoryMode = false; currentTransaction.category = allCategories()[0] || 'Algemeen'" class="absolute right-2 top-2 text-xs text-red-400 hover:text-white bg-gray-900 px-2 py-1 rounded">Annuleer</button>
                      </div>
                  </div>
                </div>
            </div>
            <div class="px-6 py-4 bg-gray-900/50 flex flex-row-reverse gap-3 border-t border-gray-700">
              <button (click)="saveTransaction()" class="w-full sm:w-auto inline-flex justify-center rounded-lg shadow-sm px-5 py-2.5 bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                Opslaan
              </button>
              <button (click)="closeModal()" class="w-full sm:w-auto inline-flex justify-center rounded-lg border border-gray-600 shadow-sm px-5 py-2.5 bg-transparent text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. CSV Mapping Modal -->
      <div *ngIf="showCsvModal" class="fixed inset-0 z-50 overflow-y-auto">
        <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
          <div class="fixed inset-0 bg-gray-950 bg-opacity-90 transition-opacity backdrop-blur-sm"></div>
          
          <div class="inline-block align-bottom bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full border border-gray-700">
             <div class="px-6 py-5 border-b border-gray-700">
               <h3 class="text-xl font-bold text-white">CSV Kolommen Koppelen</h3>
               <p class="text-sm text-gray-400 mt-1">Geef aan welke kolom in je bestand overeenkomt met de velden.</p>
             </div>
             
             <div class="p-6 space-y-6">
                <!-- Template Selection & Save -->
                <div class="bg-gray-700/50 p-4 rounded-lg border border-gray-700 space-y-3">
                    <h4 class="text-sm font-semibold text-gray-300">Mapping Template</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <!-- Load Template -->
                        <select 
                            [ngModel]="selectedTemplateName" 
                            (ngModelChange)="loadMappingTemplate($event)"
                            class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm appearance-none cursor-pointer">
                            <option value="">Selecteer Template...</option>
                            <option *ngFor="let template of mappingTemplates()" [value]="template.name">{{ template.name }}</option>
                        </select>
                        
                        <!-- Save Template -->
                        <div class="flex gap-2">
                           <input type="text" [(ngModel)]="newTemplateName" placeholder="Naam voor nieuwe template" class="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                           <button (click)="saveMappingTemplate()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm transition-colors flex-shrink-0" title="Template opslaan" [disabled]="!apiConfig().token">
                               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3m-1-4l-8.4-8.4-5 5 8.4 8.4 5-5zM9 8h.01"></path></svg>
                           </button>
                        </div>
                    </div>
                </div>

                <!-- Preview Table -->
                <div class="overflow-x-auto border border-gray-700 rounded-lg mb-6">
                   <table class="w-full text-xs text-left text-gray-400">
                      <thead class="bg-gray-900 text-gray-200 uppercase">
                         <tr>
                            <th *ngFor="let header of csvPreviewHeaders; let i = index" class="px-3 py-2 border-r border-gray-700 last:border-0">
                               Col {{i + 1}}: {{header}}
                            </th>
                         </tr>
                      </thead>
                      <tbody>
                         <tr class="border-b border-gray-700 last:border-0">
                            <td *ngFor="let val of csvPreviewRow" class="px-3 py-2 border-r border-gray-700 last:border-0 truncate max-w-[150px]">{{val}}</td>
                         </tr>
                      </tbody>
                   </table>
                </div>

                <!-- Selectors -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                      <label class="block text-sm font-medium text-blue-400 mb-1">Datum Kolom</label>
                      <select [(ngModel)]="csvMapping.dateCol" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                         <option *ngFor="let h of csvPreviewHeaders; let i = index" [value]="i">{{h}} (Col {{i+1}})</option>
                      </select>
                   </div>
                   <div>
                      <label class="block text-sm font-medium text-blue-400 mb-1">Bedrag Kolom</label>
                      <select [(ngModel)]="csvMapping.amountCol" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                         <option *ngFor="let h of csvPreviewHeaders; let i = index" [value]="i">{{h}} (Col {{i+1}})</option>
                      </select>
                   </div>
                   <div class="sm:col-span-2">
                      <label class="block text-sm font-medium text-blue-400 mb-1">Omschrijving Kolom</label>
                      <select [(ngModel)]="csvMapping.descCol" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                         <option *ngFor="let h of csvPreviewHeaders; let i = index" [value]="i">{{h}} (Col {{i+1}})</option>
                      </select>
                   </div>
                   <div>
                      <label class="block text-sm font-medium text-blue-400 mb-1">Rekeningnummer (Optioneel)</label>
                      <select [(ngModel)]="csvMapping.accountCol" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                         <option [ngValue]="undefined">Niet importeren</option>
                         <option *ngFor="let h of csvPreviewHeaders; let i = index" [value]="i">{{h}} (Col {{i+1}})</option>
                      </select>
                   </div>
                   <div>
                      <label class="block text-sm font-medium text-blue-400 mb-1">Saldo (Optioneel)</label>
                      <select [(ngModel)]="csvMapping.balanceCol" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                         <option [ngValue]="undefined">Niet importeren</option>
                         <option *ngFor="let h of csvPreviewHeaders; let i = index" [value]="i">{{h}} (Col {{i+1}})</option>
                      </select>
                   </div>
                </div>
             </div>

             <div class="px-6 py-4 bg-gray-900/50 flex flex-col sm:flex-row justify-end gap-3 border-t border-gray-700">
                <button (click)="processCsvImport()" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium transition-colors" [disabled]="!apiConfig().token">
                   Importeren
                </button>
                <button (click)="showCsvModal = false" class="text-gray-400 hover:text-white px-4 py-2 font-medium">Annuleren</button>
             </div>
          </div>
        </div>
      </div>

      <!-- 3. Bulk Edit Modal -->
      <div *ngIf="showBulkEditModal" class="fixed inset-0 z-50 overflow-y-auto">
        <div class="flex items-center justify-center min-h-screen px-4">
          <div class="fixed inset-0 bg-gray-950 bg-opacity-90 transition-opacity backdrop-blur-sm" (click)="showBulkEditModal = false"></div>
          
          <div class="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md relative border border-gray-700">
             <h3 class="text-xl font-bold text-white mb-2">Bulk Bewerken</h3>
             <p class="text-gray-400 text-sm mb-4">
               Je staat op het punt <span class="text-white font-bold">{{ filteredTransactions().length }}</span> transacties bij te werken.
             </p>
             
             <div class="mb-4 bg-gray-900 p-3 rounded-lg text-sm text-gray-300 border border-gray-700">
                <span class="block text-xs text-gray-500 uppercase">Huidig Filter:</span>
                <span class="italic">"{{ searchTerm() || 'Alles' }}"</span>
             </div>

             <div class="space-y-4 mb-6">
                <!-- Categorie Bewerken -->
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Nieuwe Categorie</label>
                  <select [(ngModel)]="bulkEditCategory" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 appearance-none">
                    <option value="" disabled selected>Kies een categorie (optioneel)...</option>
                    <option *ngFor="let cat of allCategories()" [value]="cat">{{ cat }}</option>
                    <option value="NEW">+ Nieuwe Categorie (Typ in lijst)</option>
                  </select>
                  <input *ngIf="bulkEditCategory === 'NEW'" type="text" [(ngModel)]="bulkEditCustomCategory" placeholder="Typ nieuwe categorie..." class="mt-2 w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500">
                </div>

                <!-- Omschrijving Bewerken -->
                <div>
                   <label class="block text-sm font-medium text-gray-400 mb-1">Nieuwe Omschrijving</label>
                   <input type="text" [(ngModel)]="bulkEditDescription" placeholder="Typ nieuwe omschrijving (optioneel)..." class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500">
                </div>
             </div>

             <div class="flex justify-end gap-2">
                <button (click)="applyBulkEdit()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">Toepassen</button>
                <button (click)="showBulkEditModal = false" class="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg transition-colors">Annuleren</button>
             </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #111827; }
    ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #4B5563; }
    .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    
    /* Responsive Table Fixes (Ensures data wraps better on tiny screens) */
    @media (max-width: 640px) {
        .overflow-x-auto table {
            font-size: 0.75rem; /* text-xs */
        }
        .overflow-x-auto th, .overflow-x-auto td {
            padding: 0.5rem; /* p-2 */
        }
        .overflow-x-auto th:nth-child(3), 
        .overflow-x-auto td:nth-child(3) {
            min-width: 150px; /* Description column */
        }
        .overflow-x-auto th:nth-child(6), 
        .overflow-x-auto td:nth-child(6) {
            min-width: 80px; /* Balance column */
        }
    }
  `]
})
export class App {
  // --- SERVICE & CONFIGURATION ---
  private apiService: ApiService;
  
  // GEWIJZIGD: Tijdelijke configuratie bevat nu het wachtwoord.
  apiConfig = signal<ApiConfig>(this.loadApiConfig());
  newApiConfig: ApiConfig = this.loadApiConfig(); // Temp state voor de form
  isLoading = signal(false);
  loadingMessage = signal('Initialiseren...');

  // Navigation
  tabs = [
    { id: 'dashboard', label: 'Overzicht' },
    { id: 'transactions', label: 'Transacties' },
    { id: 'stats', label: 'Statistieken' },
    { id: 'rules', label: 'Regels' },
    { id: 'settings', label: 'Beheer' }
  ];
  activeTab = signal<string>('dashboard');

  // Data
  transactions = signal<Transaction[]>([]);
  mappingTemplates = signal<CsvMappingTemplate[]>([]);
  categorizationRules = signal<CategorizationRule[]>([]);
  manualCategories = signal<string[]>([]);
  
  accountNames = signal<Record<string, string>>({});
  
  // Dashboard Navigation State
  dashboardMonthOffset = signal(0);
  
  // Transaction List Filters (Signals)
  searchTerm = signal('');
  categoryFilter = signal('ALL');
  typeFilter = signal('ALL');
  accountFilter = signal('ALL');
  dateFromFilter = signal('');
  dateToFilter = signal('');

  // Stats State
  statsPeriod = signal<Period>('6M');
  periods: Period[] = ['1M', '6M', '1Y', 'ALL'];

  // Transaction Modal State
  showModal = false;
  isEditing = false;
  isNewCategoryMode = false;
  currentTransaction: Transaction = this.getEmptyTransaction();

  // CSV Import State
  showCsvModal = false;
  csvRawData: string[][] = [];
  csvPreviewHeaders: string[] = [];
  csvPreviewRow: string[] = [];
  csvMapping: CsvMapping = { dateCol: 0, descCol: 1, amountCol: 2, accountCol: undefined, balanceCol: undefined };
  selectedTemplateName: string = '';
  newTemplateName: string = '';

  // Bulk Edit State
  showBulkEditModal = false;
  bulkEditCategory = '';
  bulkEditCustomCategory = '';
  bulkEditDescription = '';
  
  newRule: CategorizationRule = { id: this.generateUUID(), keyword: '', category: '', type: 'config', subType: 'rule', newDescription: '' };

  // Category Management State
  newCategoryName = '';
  
  constructor() {
    this.apiService = new ApiService(this.apiConfig());
    this.loadAllData();
  }
  
  // --- DATA LOADING & API WRAPPERS ---
  
  loadApiConfig(): ApiConfig {
      // GEWIJZIGD: username is nu verplicht in de API Config interface
      const defaultConfig: ApiConfig = { url: '', token: '', username: '', endpointName: 'finance', password: '' };
      try {
          const configStr = localStorage.getItem('apiConfig');
          if (configStr) {
              const config = JSON.parse(configStr);
              return { 
                  url: config.url || '', 
                  token: config.token || '', 
                  username: config.username || '', // Zorg dat username geladen wordt
                  endpointName: config.endpointName || defaultConfig.endpointName,
                  password: '' // Wachtwoord wordt nooit opgeslagen, dus is leeg bij laden
              };
          }
      } catch (e) {
          console.error('Fout bij laden API config:', e);
      }
      return defaultConfig;
  }
  
  async saveApiConfig() {
    // 1. Validatie
    if (!this.newApiConfig.url || !this.newApiConfig.endpointName || !this.newApiConfig.username || !this.newApiConfig.password) {
        alert("Vul API URL, Endpoint Naam, Gebruikersnaam én Wachtwoord in.");
        return;
    }
    
    this.isLoading.set(true);
    this.loadingMessage.set('Bezig met aanmelden...');
    
    try {
        // 2. Login om token op te halen
        const newToken = await this.apiService.login(
            this.newApiConfig.url, 
            this.newApiConfig.username, 
            this.newApiConfig.password
        );
        
        // 3. Update de configuratie met het ontvangen token
        const configToSave: ApiConfig = {
            url: this.newApiConfig.url,
            token: newToken, // HET BELANGRIJKE VELD: het opgehaalde token
            username: this.newApiConfig.username,
            endpointName: this.newApiConfig.endpointName
            // password wordt hier NIET opgeslagen
        };
        
        this.apiService.updateConfig(configToSave);
        this.apiConfig.set(configToSave);
        
        // Leeg het wachtwoord veld voor de veiligheid, want het is nu in het token verwerkt
        this.newApiConfig.password = ''; 

        // 4. Laad data met de nieuwe configuratie
        await this.loadAllData(true);
        alert("API configuratie opgeslagen en synchronisatie gestart.");
        
    } catch (e) {
        console.error('Login fout:', e);
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fout bij aanmelden of opslaan: ${message}`);
        this.apiConfig.update(c => ({...c, token: ''})); // Zorg dat token leeg is bij fout
    } finally {
        this.isLoading.set(false);
    }
}


  async loadAllData(forceReload = false) {
      if (!this.apiConfig().token || !this.apiConfig().endpointName) return;
      
      this.isLoading.set(true);
      this.loadingMessage.set('Transacties en configuratie ophalen...');
      
      try {
        const txs = await this.apiService.getTransactions<Transaction>();
        this.transactions.set(txs);

        const rules = await this.apiService.getConfigItems<CategorizationRule>('rule');
        this.categorizationRules.set(rules);

        const templates = await this.apiService.getConfigItems<CsvMappingTemplate>('mapping_template');
        this.mappingTemplates.set(templates);
        
        const accountRecord = await this.apiService.getConfigItems<AccountNameRecord>('account_names');
        this.accountNames.set(accountRecord[0]?.names || {});
        
        const manualCatRecord = await this.apiService.getConfigItems<ManualCategoryRecord>('manual_categories');
        this.manualCategories.set(manualCatRecord[0]?.categories || []);

      } catch (e) {
        console.error('Fout bij het laden van data:', e);
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fout bij het synchroniseren met de API: ${message}. Controleer uw URL, Endpoint Naam en of uw Token nog geldig is.`);
        this.apiConfig.update(c => ({...c, token: ''}));
      } finally {
        this.isLoading.set(false);
      }
  }
  
  async saveItem<T extends { id: string, type: string }>(item: T): Promise<T> {
      if (!this.apiConfig().token) throw new Error("API not configured");
      
      this.isLoading.set(true);
      this.loadingMessage.set(`Bezig met opslaan van ${item.type}...`);
      
      try {
          if (item.id && item.id !== 'local_temp_id') {
             return await this.apiService.updateItem(item);
          } else {
             const newItem = await this.apiService.addItem(item);
             return newItem;
          }
      } catch (e) {
          console.error('Fout bij opslaan item:', e);
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij opslaan van ${item.type}: ${message}`);
          throw e;
      } finally {
          this.isLoading.set(false);
      }
  }
  
  // --- ACCOUNT & CATEGORY MANAGEMENT ---
  
  getAccountName(accNum?: string): string {
      if (!accNum) return '-';
      return this.accountNames()[accNum] || accNum;
  }
  
  setAccountName(accNum: string, name: string) {
      this.accountNames.update(names => {
          names[accNum] = name;
          return { ...names };
      });
  }
  
  uniqueAccountNumbers = computed(() => {
      const accs = new Set(this.transactions().map(t => t.accountNumber).filter(a => a));
      return Array.from(accs).sort();
  });
  
  async saveAccountNames() {
      const currentNames = this.accountNames();
      const existingRecord = this.categorizationRules().find(r => (r as any).subType === 'account_names') as AccountNameRecord | undefined;
      
      const record: AccountNameRecord = {
          id: existingRecord?.id || 'account_names_singleton',
          names: currentNames,
          type: 'config',
          subType: 'account_names'
      };
      
      try {
          await this.saveItem(record);
          alert("Rekeningnamen succesvol opgeslagen.");
      } catch (e) {
          // Foutmelding wordt al in saveItem gegeven
      }
  }
  
  async addManualCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    if (this.allCategories().includes(name)) {
        alert(`Categorie "${name}" bestaat al.`);
        return;
    }
    
    try {
        this.manualCategories.update(cats => [...cats, name]);
        await this.saveManualCategories();
        this.newCategoryName = '';
        alert(`Categorie "${name}" toegevoegd.`);
    } catch(e) {
        this.manualCategories.update(cats => cats.filter(c => c !== name));
    }
  }
  
  async deleteManualCategory(catToDelete: string) {
      if (!confirm(`Weet je zeker dat je de handmatige categorie "${catToDelete}" wilt verwijderen? Dit beïnvloedt GEEN bestaande transacties.`)) return;
      
      const oldCats = this.manualCategories();
      const newCats = oldCats.filter(c => c !== catToDelete);
      
      try {
          this.manualCategories.set(newCats);
          await this.saveManualCategories();
          alert(`Categorie "${catToDelete}" verwijderd.`);
      } catch(e) {
          this.manualCategories.set(oldCats);
      }
  }
  
  async saveManualCategories() {
       const existingRecord = this.categorizationRules().find(r => (r as any).subType === 'manual_categories') as ManualCategoryRecord | undefined;
      
       const record: ManualCategoryRecord = {
           id: existingRecord?.id || 'manual_categories_singleton',
           categories: this.manualCategories(),
           type: 'config',
           subType: 'manual_categories'
       };
       
       return this.saveItem(record);
  }


  allCategories = computed(() => {
      const usedCats = new Set(this.transactions().map(t => t.category));
      this.manualCategories().forEach(cat => usedCats.add(cat));
      return Array.from(usedCats).sort();
  });
  
  async renameCategory(oldCat: string) {
      const newCat = prompt(`Hernoem categorie "${oldCat}" naar:`);
      if (!newCat || newCat === oldCat) return;
      
      const updatedTxs: Transaction[] = this.transactions().map(t => ({
          ...t,
          category: t.category === oldCat ? newCat : t.category
      }));
      this.transactions.set(updatedTxs);

      const updatedRules: CategorizationRule[] = this.categorizationRules().map(r => ({
          ...r,
          category: r.category === oldCat ? newCat : r.category
      }));
      this.categorizationRules.set(updatedRules);
      
      const updatedManualCats: string[] = this.manualCategories().map(cat => cat === oldCat ? newCat : cat).filter(c => c !== oldCat);
      this.manualCategories.set(updatedManualCats);


      try {
          await Promise.all(updatedRules
              .filter(r => r.category === newCat && r.id !== 'local_temp_id')
              .map(r => this.saveItem(r)));
              
          await this.saveManualCategories();

          alert(`Categorie "${oldCat}" is hernoemd naar "${newCat}". Regels en handmatige lijst zijn bijgewerkt. Let op: Transacties in de database worden bij de volgende opslag/verwijdering bijgewerkt.`);
          
      } catch (e) {
          this.loadAllData();
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij opslaan op API. Rollback uitgevoerd: ${message}`);
      }
  }
  
  async deleteAllTransactions() {
      if (!confirm("WEES VOORZICHTIG! Weet je zeker dat je ALLE transacties permanent wilt verwijderen? Dit kan niet ongedaan gemaakt worden.")) {
          return;
      }
      
      this.isLoading.set(true);
      this.loadingMessage.set('Alle transacties permanent verwijderen...');
      
      try {
          await this.apiService.deleteBulk('transaction');
          this.transactions.set([]);
          alert("Alle transacties zijn gewist uit de API.");
      } catch (e) {
          console.error('Fout bij bulk delete:', e);
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij wissen transacties: ${message}`);
          this.loadAllData();
      } finally {
          this.isLoading.set(false);
      }
  }


  // --- AUTOMATIC CATEGORIZATION RULES ---
  
  async addRule() {
      if (!this.newRule.keyword || !this.newRule.category) {
          alert('Trefwoord en Categorie zijn verplicht.');
          return;
      }
      const ruleToAdd: CategorizationRule = { 
          id: this.generateUUID(),
          keyword: this.newRule.keyword.toLowerCase().trim(), 
          category: this.newRule.category,
          type: 'config',
          subType: 'rule',
          newDescription: this.newRule.newDescription?.trim() || undefined
      };
      
      const oldRules = this.categorizationRules();
      this.categorizationRules.update(rules => [...rules, ruleToAdd]);

      try {
          const savedRule = await this.saveItem(ruleToAdd);
          this.categorizationRules.update(rules => rules.map(r => r.id === ruleToAdd.id ? savedRule : r));
          
          this.newRule.keyword = '';
          this.newRule.category = '';
          this.newRule.newDescription = '';
          this.newRule.id = this.generateUUID();
          
      } catch (e) {
          this.categorizationRules.set(oldRules);
      }
  }
  
  async deleteRule(id: string) {
      const oldRules = this.categorizationRules();
      const ruleToDelete = oldRules.find(r => r.id === id);
      if (!ruleToDelete) return;
      
      this.categorizationRules.update(rules => rules.filter(r => r.id !== id));
      
      try {
          await this.apiService.deleteItem(id);
      } catch (e) {
          this.categorizationRules.set(oldRules);
      }
  }
  
  async applyRuleToExisting(rule: CategorizationRule) {
      const keyword = rule.keyword.toLowerCase();
      let count = 0;
      
      const transactionsToUpdate: Transaction[] = [];
      const updatedTxs: Transaction[] = this.transactions().map(t => {
          if (t.description.toLowerCase().includes(keyword)) {
              count++;
              const updated: Transaction = { 
                  ...t,
                  category: rule.category,
                  description: rule.newDescription || t.description
              };
              transactionsToUpdate.push(updated);
              return updated;
          }
          return t;
      });
      
      this.transactions.set(updatedTxs);
      
      this.isLoading.set(true);
      this.loadingMessage.set(`Regel toepassen op ${count} transacties...`);

      try {
          await Promise.all(transactionsToUpdate.map(t => 
              this.apiService.updateItem(t) 
          ));
          alert(`Regel succesvol toegepast: ${count} bestaande transacties bijgewerkt.`);
      } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij bijwerken transacties op API. Synchroniseer opnieuw: ${message}`);
          this.loadAllData();
      } finally {
          this.isLoading.set(false);
      }
  }
  
  applyRulesToNewDescription(description: string) {
      const rules = this.categorizationRules();
      const lowerDesc = description.toLowerCase();
      
      for (const rule of rules) {
          if (lowerDesc.includes(rule.keyword)) {
              this.currentTransaction.category = rule.category;
              if (rule.newDescription) {
                  this.currentTransaction.description = rule.newDescription;
              }
              return; 
          }
      }
  }

  applyRulesToImport(tx: Transaction): Transaction {
      const rules = this.categorizationRules();
      const lowerDesc = tx.description.toLowerCase();
      
      for (const rule of rules) {
          if (lowerDesc.includes(rule.keyword)) {
              tx.category = rule.category;
              
              if (rule.newDescription) {
                  tx.description = rule.newDescription;
              }
              
              return tx;
          }
      }
      return tx;
  }
  
  // --- TEMPLATE LOGIC ---

  loadMappingTemplate(name: string) {
    if (!name) return;
    const template = this.mappingTemplates().find(t => t.name === name);
    if (template) {
      this.csvMapping = {
        dateCol: template.dateCol,
        descCol: template.descCol,
        amountCol: template.amountCol,
        categoryCol: template.categoryCol,
        accountCol: template.accountCol,
        balanceCol: template.balanceCol,
      };
      this.selectedTemplateName = name;
      alert(`Template "${name}" geladen.`);
    }
  }

  async saveMappingTemplate() {
    const name = this.newTemplateName.trim();
    if (!name) {
      alert("Geef de template een naam.");
      return;
    }

    const existingTemplate = this.mappingTemplates().find(t => t.name === name);
    const id = existingTemplate?.id || this.generateUUID();

    const newTemplate: CsvMappingTemplate = {
      id: id,
      name: name,
      type: 'config',
      subType: 'mapping_template',
      ...this.csvMapping
    };

    const oldTemplates = this.mappingTemplates();
    
    this.mappingTemplates.update(templates => {
      const index = templates.findIndex(t => t.name === name);
      if (index !== -1) {
        templates[index] = newTemplate;
      } else {
        templates.push(newTemplate);
      }
      return [...templates];
    });

    try {
        const savedTemplate = await this.saveItem(newTemplate);
        
        this.mappingTemplates.update(templates => templates.map(t => t.name === name ? savedTemplate : t));
        
        this.selectedTemplateName = name;
        this.newTemplateName = '';
        alert(`Template "${name}" is opgeslagen.`);
    } catch (e) {
        this.mappingTemplates.set(oldTemplates);
    }
  }
  
  // --- HELPERS FOR COLORS ---
  
  getCategoryColor(category: string): string {
    if (!category) return '#6B7280';
    
    const colors = [
      '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', 
      '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#A855F7', '#FB7185',
    ];

    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  // --- COMPUTES ---

  filteredTransactions = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const catFilter = this.categoryFilter();
    const tFilter = this.typeFilter();
    const aFilter = this.accountFilter();
    const dateFrom = this.dateFromFilter();
    const dateTo = this.dateToFilter();

    let filtered = this.transactions()
      .filter(t => {
        const tagsString = t.tags?.join(' ').toLowerCase() || '';
        const matchesSearch = t.description.toLowerCase().includes(term) || 
                              t.category.toLowerCase().includes(term) ||
                              tagsString.includes(term); 
                              
        const matchesCat = catFilter === 'ALL' || t.category === catFilter;
        const matchesType = tFilter === 'ALL' || t.type === tFilter;
        const matchesAccount = aFilter === 'ALL' || t.accountNumber === aFilter;
        
        const matchesDateFrom = !dateFrom || t.date >= dateFrom;
        const matchesDateTo = !dateTo || t.date <= dateTo;
        
        return matchesSearch && matchesCat && matchesType && matchesAccount && matchesDateFrom && matchesDateTo;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      return filtered;
  });

  uniqueCategories = computed(() => {
    const cats = new Set(this.transactions().map(t => t.category));
    return Array.from(cats).sort();
  });

  totalStats = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const txs = this.transactions().filter(t => new Date(t.date).getFullYear() === currentYear);
    const income = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  });

  matrixData = computed(() => {
    const data = this.transactions();
    const offset = this.dashboardMonthOffset();
    const baseDate = new Date();
    
    baseDate.setMonth(baseDate.getMonth() + offset);

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const activeCategories = new Set<string>();
    data.forEach(t => {
      if (months.includes(t.date.slice(0, 7))) activeCategories.add(t.category);
    });
    return { months, categories: Array.from(activeCategories).sort() };
  });

  statsFilteredData = computed(() => {
    const all = this.transactions().sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const period = this.statsPeriod();
    if (period === 'ALL') return all;

    const now = new Date();
    let cutoff = new Date();
    if (period === '1M') cutoff.setMonth(now.getMonth() - 1);
    if (period === '6M') cutoff.setMonth(now.getMonth() - 6);
    if (period === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
    
    return all.filter(t => new Date(t.date) >= cutoff);
  });
  
  trendAnalysis = computed(() => {
      const txs = this.statsFilteredData().filter(t => t.type === 'expense');
      
      const now = new Date();
      const currentMonthKey = now.toISOString().slice(0, 7);
      
      const currentMonthExpenses = new Map<string, number>();
      txs.filter(t => t.date.startsWith(currentMonthKey)).forEach(t => {
          currentMonthExpenses.set(t.category, (currentMonthExpenses.get(t.category) || 0) + t.amount);
      });
      
      const referenceExpenses = new Map<string, number>();
      const monthKeys: string[] = [];
      for(let i = 1; i <= 3; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          monthKeys.push(d.toISOString().slice(0, 7));
      }

      txs.filter(t => monthKeys.includes(t.date.slice(0, 7))).forEach(t => {
          referenceExpenses.set(t.category, (referenceExpenses.get(t.category) || 0) + t.amount);
      });

      const categories = Array.from(new Set([...Array.from(currentMonthExpenses.keys()), ...Array.from(referenceExpenses.keys())]));
      
      const results: { category: string, diff: number, pctChange: number, current: number, avg: number }[] = [];

      categories.forEach(cat => {
          const current = currentMonthExpenses.get(cat) || 0;
          const refTotal = referenceExpenses.get(cat) || 0;
          const avg = refTotal / 3;
          
          if (avg > 100 || current > 100) {
              const diff = current - avg;
              const pctChange = avg > 0 ? Math.round((diff / avg) * 100) : 100;
              
              if (Math.abs(pctChange) >= 20) {
                  results.push({ category: cat, diff, pctChange, current, avg });
              }
          }
      });
      
      results.sort((a,b) => b.diff - a.diff);

      return {
          high: results.filter(r => r.diff > 0),
          low: results.filter(r => r.diff < 0).map(r => ({...r, diff: Math.abs(r.diff)})),
      };
  });

  barChartData = computed(() => {
    const txs = this.statsFilteredData().filter(t => t.type === 'expense');
    const buckets = new Map<string, number>(); 
    
    txs.forEach(t => {
       buckets.set(t.category, (buckets.get(t.category) || 0) + t.amount);
    });

    const data = Array.from(buckets.entries()).map(([cat, val]) => ({
       label: cat,
       value: val,
       color: this.getCategoryColor(cat)
    }));

    data.sort((a,b) => b.value - a.value);

    const topData = data.slice(0, 8);

    const max = Math.max(...topData.map(d => d.value), 10);
    
    return topData.map(d => ({ ...d, pct: (d.value / max) * 100 }));
  });

  getBarMax() {
      const data = this.barChartData();
      if (!data.length) return 0;
      const maxVal = Math.max(...data.map(d => d.value), 10);
      
      if (maxVal < 100) return Math.ceil(maxVal / 10) * 10;
      if (maxVal < 1000) return Math.ceil(maxVal / 100) * 100;
      return Math.ceil(maxVal / 500) * 500;
  }

  lineChartData = computed(() => {
    const txs = this.statsFilteredData();
    const sortedTxs = [...txs].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const period = this.statsPeriod();
    
    const getGroupKey = (dateStr: string) => {
      const d = new Date(dateStr);
      if (period === '1M') return dateStr;
      if (period === '1Y' || period === 'ALL') return dateStr.slice(0, 7);
      
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() + 4 - (d.getDay() || 7)); 
      const yearStart = new Date(d.getFullYear(),0,1);
      const weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
      return `${d.getFullYear()}-W${weekNo}`;
    };

    const pointsMap = new Map<string, { label: string, value: number }>();
    
    sortedTxs.forEach(t => {
        if (t.currentBalance !== undefined) {
            const key = getGroupKey(t.date);
            let label = key;
            if (key.includes('-W')) label = key.split('-')[1]; 
            else if (key.length === 10) label = key.slice(5); 
            else if (key.length === 7) label = key.slice(5); 

            pointsMap.set(key, { label: label, value: t.currentBalance });
        }
    });

    const points = Array.from(pointsMap.entries())
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => a.key.localeCompare(b.key));
      
    if (points.length === 0) return [];
    
    const minVal = Math.min(0, ...points.map(p => p.value));
    const maxVal = Math.max(0, ...points.map(p => p.value));
    const range = maxVal - minVal || 1;

    return points.map((p, i) => ({
        ...p,
        x: (i / (points.length - 1 || 1)) * 100,
        y: 100 - ((p.value - minVal) / range) * 100
    }));
  });

  lineChartPoints = computed(() => {
      return this.lineChartData().map(p => `${p.x},${p.y}`).join(' ');
  });

  pieChartData = computed(() => {
    const txs = this.statsFilteredData().filter(t => t.type === 'expense');
    const totals = new Map<string, number>();
    let totalExp = 0;
    
    txs.forEach(t => {
        totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
        totalExp += t.amount;
    });

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1]) 
      .map(([cat, val]) => ({
          label: cat,
          value: val,
          percentage: totalExp ? Math.round((val / totalExp) * 100) : 0,
          color: this.getCategoryColor(cat)
      }));
  });
  
  pieTotal = computed(() => this.statsFilteredData().filter(t => t.type === 'expense').reduce((sum,t) => sum+t.amount,0));

  getPieGradient() {
    const data = this.pieChartData();
    if (!data.length) return '#1F2937';
    
    let gradient = 'conic-gradient(';
    let currentDeg = 0;
    
    data.forEach((item, index) => {
        const deg = (item.percentage / 100) * 360;
        gradient += `${item.color} ${currentDeg}deg ${currentDeg + deg}deg`;
        currentDeg += deg;
        if (index < data.length - 1) gradient += ', ';
    });
    
    gradient += ')';
    return gradient;
  }
  
  reloadData() {
  }

  // --- ACTIONS ---

  shouldShowLabel(index: number, total: number, period: Period): boolean {
    if (total <= 1) return true;
    
    if (period === '1M') return index % 7 === 0;

    if (total <= 12) return true;
    if (total <= 24) return index % 2 === 0;
    if (total <= 52) return index % 4 === 0;
    return index % 8 === 0;
  }

  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  moveDashboard(delta: number) {
    this.dashboardMonthOffset.update(v => v + delta);
  }

  openBulkEdit() {
      this.bulkEditCategory = '';
      this.bulkEditCustomCategory = '';
      this.bulkEditDescription = '';
      this.showBulkEditModal = true;
  }
  
  async applyBulkEdit() {
      let finalCat = this.bulkEditCategory;
      if (finalCat === 'NEW') {
        finalCat = this.bulkEditCustomCategory;
      }
      
      const newDesc = this.bulkEditDescription;

      if (!finalCat && !newDesc) {
        alert("Vul een categorie of omschrijving in om te wijzigen.");
        return;
      }
      
      const transactionsToUpdate: Transaction[] = [];
      const filteredIds = this.filteredTransactions().map(t => t.id);
      
      const updatedTxs: Transaction[] = this.transactions().map(t => {
             if (filteredIds.includes(t.id)) {
                 const updated = { ...t };
                 if (finalCat) updated.category = finalCat;
                 if (newDesc) updated.description = newDesc;
                 
                 const finalUpdated = newDesc ? this.applyRulesToImport(updated) : updated;
                 
                 transactionsToUpdate.push(finalUpdated);
                 return finalUpdated;
             }
             return t;
      });
      
      this.transactions.set(updatedTxs);
      this.showBulkEditModal = false;
      
      this.isLoading.set(true);
      this.loadingMessage.set(`Bulk update van ${transactionsToUpdate.length} transacties...`);

      try {
          await Promise.all(transactionsToUpdate.map(t => 
              this.apiService.updateItem(t) 
          ));
          alert(`${transactionsToUpdate.length} transacties succesvol bijgewerkt in de API.`);
      } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij bulk update op API. Synchroniseer opnieuw: ${message}`);
          this.loadAllData();
      } finally {
          this.isLoading.set(false);
      }
  }

  parseSmartNumber(amountStr: string): number {
      if (!amountStr) return 0;
      amountStr = amountStr.trim().replace('€', '').replace('EUR', '');
      
      const lastComma = amountStr.lastIndexOf(',');
      const lastDot = amountStr.lastIndexOf('.');

      let cleanStr: string;
      if (lastComma > lastDot) {
          cleanStr = amountStr.replace(/\./g, '').replace(',', '.');
      } else {
          cleanStr = amountStr.replace(/,/g, '');
      }

      cleanStr = cleanStr.replace(/[^\d.-]/g, ''); 
      
      if (cleanStr === '' || cleanStr === '.') return 0;
      
      const amount = parseFloat(cleanStr);
      
      if (isNaN(amount) && amountStr !== '') {
         throw new Error('Invalid Amount');
      }
      
      return isNaN(amount) ? 0 : amount;
  }


  handleCsvFile(event: any) {
    if (!this.apiConfig().token || !this.apiConfig().endpointName) {
        alert("Stel eerst de API configuratie in op het tabblad 'Beheer'.");
        return;
    }
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((l:string) => l.trim() !== '');
        if (lines.length < 2) { alert('Leeg of ongeldig bestand'); return; }

        const firstLine = lines[0];
        const separator = firstLine.includes(';') ? ';' : ',';

        this.csvRawData = lines.map((l:string) => {
            return l.split(separator).map(val => val.replace(/^"|"$/g, '').trim());
        });

        this.csvPreviewHeaders = this.csvRawData[0];
        this.csvPreviewRow = this.csvRawData[1] || []; 
        this.showCsvModal = true;
    };
    reader.readAsText(file);
  }

  async processCsvImport() {
      const { dateCol, descCol, amountCol, accountCol, balanceCol } = this.csvMapping;
      const dataRows = this.csvRawData.slice(1); 
      const newTxs: Transaction[] = [];
      let skipped = 0;

      dataRows.forEach((row, index) => {
          if (row.length < Math.max(dateCol, descCol, amountCol, accountCol || 0, balanceCol || 0)) {
             return;
          }

          try {
              let amount = this.parseSmartNumber(row[amountCol]);
              
              let dateRaw = row[dateCol];
              let dateStr = '';
              
              if (dateRaw.match(/^\d{4}-\d{2}-\d{2}$/)) { dateStr = dateRaw; } 
              else if (dateRaw.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
                  const parts = dateRaw.split('-');
                  dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              } else if (dateRaw.match(/^\d{8}$/)) {
                  dateStr = `${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`;
              } else {
                 const tryDate = new Date(dateRaw);
                 if (isNaN(tryDate.getTime())) throw new Error('Invalid Date format');
                 dateStr = tryDate.toISOString().slice(0, 10);
              }
              
              const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';
              const acc = accountCol !== undefined ? row[accountCol] : undefined;
              
              let currentBal = undefined;
              if (balanceCol !== undefined) {
                  currentBal = this.parseSmartNumber(row[balanceCol]);
              }

              let newTx: Transaction = {
                  id: this.generateUUID(),
                  date: dateStr,
                  description: row[descCol] || 'Onbekende Omschrijving',
                  amount: Math.abs(amount),
                  type: type,
                  category: 'Onbekend',
                  accountNumber: acc,
                  currentBalance: currentBal,
                  tags: [],
              };
              
              newTx = this.applyRulesToImport(newTx);
              
              newTxs.push(newTx);
          } catch (e) {
              console.error(`Row ${index} error:`, e);
              skipped++;
          }
      });

      this.showCsvModal = false;
      this.isLoading.set(true);
      this.loadingMessage.set(`Bezig met importeren van ${newTxs.length} transacties naar de API...`);
      
      const newTxsWithApiIds: Transaction[] = [];
      try {
          for (const tx of newTxs) {
              const txWithApiType = { ...tx, type: 'transaction' as const };
              const savedTx = await this.apiService.addItem(txWithApiType as any);
              newTxsWithApiIds.push(savedTx as Transaction);
          }
          
          this.transactions.update(curr => [...curr, ...newTxsWithApiIds]);
          alert(`${newTxs.length} transacties succesvol geïmporteerd. (${skipped} overgeslagen)`);
      } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          alert(`Fout bij importeren van transacties: ${message}`);
          this.loadAllData();
      } finally {
          this.isLoading.set(false);
      }
  }

  exportFilteredCsv() {
    const data = this.filteredTransactions();
    if (data.length === 0) {
        alert('Er zijn geen gefilterde transacties om te exporteren.');
        return;
    }

    const headers = ["Datum", "Rekening", "Omschrijving", "Bedrag", "Type", "Categorie", "Saldo", "Tags"];
    
    const csvRows = data.map(t => [
        t.date,
        t.accountNumber || '',
        `"${t.description.replace(/"/g, '""')}"`,
        t.type === 'expense' ? `-${t.amount.toFixed(2).replace('.', ',')}` : t.amount.toFixed(2).replace('.', ','),
        t.type,
        t.category,
        t.currentBalance !== undefined ? t.currentBalance.toFixed(2).replace('.', ',') : '',
        t.tags?.join('|') || ''
    ].join(';'));

    const csvContent = headers.join(';') + '\n' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transacties_Filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  openModal(t?: Transaction) {
    if (!this.apiConfig().token || !this.apiConfig().endpointName) {
        alert("Stel eerst de API configuratie in op het tabblad 'Beheer'.");
        return;
    }
    this.isNewCategoryMode = false;
    if (t) { 
        this.currentTransaction = { ...t }; 
        this.isEditing = true; 
    } else { 
        this.currentTransaction = this.getEmptyTransaction(); 
        this.isEditing = false; 
    }
    this.showModal = true;
  }
  
  handleCategoryChange(value: string) {
      if (value === '__NEW__') {
          this.isNewCategoryMode = true;
          this.currentTransaction.category = '';
      } else {
          this.isNewCategoryMode = false;
          this.currentTransaction.category = value;
      }
  }

  handleTagInput(value: string) {
      if (typeof value !== 'string') {
          this.currentTransaction.tags = [];
          return;
      }
      this.currentTransaction.tags = value.split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0);
  }

  closeModal() { this.showModal = false; }
  
  async saveTransaction() {
    if (!this.currentTransaction.description || this.currentTransaction.amount === null || this.currentTransaction.amount === undefined || this.currentTransaction.amount <= 0) {
      alert('Vul een geldige omschrijving en bedrag in.');
      return;
    }
    if (this.isNewCategoryMode && !this.currentTransaction.category) {
        alert('Vul een nieuwe categorie naam in.');
        return;
    }

    if (!this.currentTransaction.tags) {
        this.currentTransaction.tags = [];
    }

    const txToSave = { ...this.currentTransaction };
    if (!this.isEditing) {
        this.currentTransaction = this.applyRulesToImport(txToSave);
    }
    
    if (this.isNewCategoryMode || (this.currentTransaction.category && !this.allCategories().includes(this.currentTransaction.category))) {
        this.addManualCategoryFromModal(this.currentTransaction.category);
    }
    
    const finalTx = { ...this.currentTransaction, type: 'transaction' as const };
    const oldTx = this.isEditing ? this.transactions().find(t => t.id === finalTx.id) : null;
    
    this.isLoading.set(true);
    this.loadingMessage.set('Transactie opslaan...');

    try {
        const savedTx = await this.saveItem(finalTx as any);
        
        if (this.isEditing) {
            this.transactions.update(items => items.map(item => item.id === savedTx.id ? savedTx as Transaction : item));
        } else {
            this.transactions.update(items => [...items, savedTx as Transaction]);
        }
        this.closeModal();
    } catch (e) {
        if (!this.isEditing) {
            this.transactions.update(items => items.filter(t => t.id !== finalTx.id));
        } else if (oldTx) {
            this.transactions.update(items => items.map(t => t.id === oldTx.id ? oldTx : t));
        }
    } finally {
        this.isLoading.set(false);
    }
  }
  
  async addManualCategoryFromModal(name: string) {
      const trimmedName = name.trim();
      if (!trimmedName || this.allCategories().includes(trimmedName)) return;
      
      const oldCats = this.manualCategories();
      this.manualCategories.update(cats => [...cats, trimmedName]);
      
      try {
          await this.saveManualCategories();
      } catch (e) {
          this.manualCategories.set(oldCats);
      }
  }

  async deleteTransaction(id: string) { 
    if (!id) {
      alert('Fout: Kan deze transactie niet verwijderen (geen ID).');
      return;
    }
    if(!confirm('Weet je zeker dat je deze transactie wilt verwijderen?')) {
      return;
    }
    
    const oldTxs = this.transactions();
    const txToDelete = oldTxs.find(t => t.id === id);

    this.transactions.update(items => items.filter(t => t.id !== id));
    
    this.isLoading.set(true);
    this.loadingMessage.set('Transactie verwijderen...');

    try {
        await this.apiService.deleteItem(id);
    } catch (e) {
        if (txToDelete) {
             this.transactions.update(items => [...items, txToDelete]);
        }
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fout bij verwijderen van transactie: ${message}`);
    } finally {
        this.isLoading.set(false);
    }
  }

  getEmptyTransaction(): Transaction { 
      return { 
          id: this.generateUUID(),
          date: new Date().toISOString().slice(0, 10), 
          description: '', 
          amount: 0, 
          type: 'expense', 
          category: 'Algemeen',
          tags: []
      }; 
  }
  
  getMatrixValue(category: string, month: string): number {
    return this.transactions().filter(t => t.category === category && t.date.startsWith(month)).reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }
  getMatrixRowTotal(category: string): number {
    const months = this.matrixData().months;
    return this.transactions().filter(t => t.category === category && months.includes(t.date.slice(0, 7))).reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }
  getMonthTotal(month: string): number {
    return this.transactions()
      .filter(t => t.date.startsWith(month))
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.transactions()));
    const a = document.createElement('a'); a.href = dataStr; a.download = "backup.json"; document.body.appendChild(a); a.click(); a.remove();
  }
  
  importJson(e: any) {
      const f = e.target.files[0]; if(!f) return;
      const r = new FileReader(); 
      r.onload = (ev: any) => { 
          if(confirm('WEES VOORZICHTIG! Weet je zeker dat je alle huidige data op de API wilt overschrijven met deze lokale backup? Dit kan niet ongedaan gemaakt worden.')) {
              this.isLoading.set(true);
              this.loadingMessage.set('Lokale data overschrijven en uploaden naar API...');
              
              const importedTxs: Transaction[] = JSON.parse(ev.target.result);
              
              Promise.all([
                  this.apiService.deleteBulk('transaction'),
                  this.apiService.deleteBulk('config')
              ]).then(() => {
                 return Promise.all(importedTxs.map(tx => {
                     const txWithApiType = { ...tx, type: 'transaction' as const };
                     tx.id = this.generateUUID(); 
                     return this.apiService.addItem(txWithApiType as any);
                 }));
              }).then(() => {
                  alert('Data succesvol hersteld en geüpload naar de API!');
                  this.loadAllData();
              }).catch(err => {
                   const message = err instanceof Error ? err.message : String(err);
                   alert(`Fout bij herstellen: ${message}. Probeer handmatig opnieuw te laden.`);
                   this.loadAllData();
              }).finally(() => {
                  this.isLoading.set(false);
              });
          }
      }; 
      r.readAsText(f);
  }
  
  async loadDummyData() {
    if (!confirm("Weet je zeker dat je alle huidige data wilt verwijderen en wilt vervangen door dummy data op de API?")) return;
    
    this.isLoading.set(true);
    this.loadingMessage.set('Genereren en uploaden van dummy data...');
    
    const cats = ['Boodschappen', 'Huur', 'Salaris', 'Verzekering', 'Uit eten', 'Vervoer', 'Abonnementen', 'Kleding'];
    const dummyTxs: Transaction[] = [];
    const today = new Date();
    
    for(let i=0; i<80; i++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.floor(Math.random() * 365));
        const isIncome = Math.random() > 0.8;
        const cat = isIncome ? 'Salaris' : cats[Math.floor(Math.random() * (cats.length - 1))];
        
        const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';
        
        const tx: Transaction = {
            id: this.generateUUID(), 
            date: date.toISOString().slice(0,10),
            description: isIncome ? 'Werkgever BV' : `Betaling aan ${cat}`,
            amount: isIncome ? 2500 + Math.floor(Math.random() * 500) : 5 + Math.floor(Math.random() * 200),
            type: type,
            category: cat,
            accountNumber: `NL${Math.floor(Math.random()*99)}BANK0${Math.floor(Math.random()*999999999)}`,
            currentBalance: 1000 + Math.floor(Math.random() * 5000),
            tags: Math.random() < 0.2 ? ['zakelijk'] : []
        };
        dummyTxs.push(tx);
    }
    
    const dummyRules: CategorizationRule[] = [
        { id: this.generateUUID(), keyword: 'albert heijn', category: 'Boodschappen', type: 'config', subType: 'rule' },
        { id: this.generateUUID(), keyword: 'netflix', category: 'Abonnementen', newDescription: 'Netflix Abonnement', type: 'config', subType: 'rule' },
        { id: this.generateUUID(), keyword: 'ns', category: 'Vervoer', type: 'config', subType: 'rule' },
    ];
    
    const dummyAccountNames: AccountNameRecord = {
        id: 'account_names_singleton',
        names: { 'NL01BANK0123456789': 'Betaalrekening', 'NL99SPAR9876543210': 'Spaarrekening' },
        type: 'config',
        subType: 'account_names'
    };
    
    const dummyManualCats: ManualCategoryRecord = {
        id: 'manual_categories_singleton',
        categories: ['Vrije tijd', 'Cadeaus', 'Vakantie'],
        type: 'config',
        subType: 'manual_categories'
    };

    try {
        await Promise.all([
            this.apiService.deleteBulk('transaction'),
            this.apiService.deleteBulk('config'),
        ]);

        await Promise.all([
            ...dummyTxs.map(tx => this.apiService.addItem({ ...tx, type: 'transaction' as const } as any)), 
            ...dummyRules.map(rule => this.apiService.addItem(rule)),
            this.apiService.addItem(dummyAccountNames),
            this.apiService.addItem(dummyManualCats),
        ]);
        
        alert("Dummy data succesvol geüpload naar de API!");
        this.loadAllData();
        
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fout bij laden dummy data: ${message}`);
    } finally {
        this.isLoading.set(false);
    }
  }
}
