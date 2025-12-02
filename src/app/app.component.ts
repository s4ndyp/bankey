import { Component, computed, effect, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// --- Interfaces ---
interface Transaction {
  id: string;
  date: string; // ISO format YYYY-MM-DD
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
}

interface MonthlySummary {
  month: string; // YYYY-MM
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, CurrencyPipe, DecimalPipe],
  encapsulation: ViewEncapsulation.None,
  template: `
    <!-- De hoofdcontainer met Tailwind classes voor donkere modus -->
    <div class="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500 selection:text-white">
      
      <!-- Navbar -->
      <nav class="border-b border-gray-800 bg-gray-950/50 backdrop-blur fixed top-0 w-full z-10">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center gap-2">
              <div class="bg-blue-600 p-2 rounded-lg">
                <!-- Inline SVG Logo -->
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span class="font-bold text-xl tracking-tight">MijnFinanciën</span>
            </div>
            
            <!-- Navigatie Knoppen -->
            <div class="flex space-x-2 sm:space-x-4">
              <button 
                (click)="activeTab.set('dashboard')"
                [class]="activeTab() === 'dashboard' ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
                class="px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Overzicht
              </button>
              <button 
                (click)="activeTab.set('transactions')"
                [class]="activeTab() === 'transactions' ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
                class="px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Transacties
              </button>
              <button 
                (click)="activeTab.set('settings')"
                [class]="activeTab() === 'settings' ? 'bg-gray-800 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
                class="px-3 py-2 rounded-md text-sm font-medium transition-colors">
                Beheer
              </button>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        
        <!-- VIEW: DASHBOARD -->
        <div *ngIf="activeTab() === 'dashboard'" class="animate-fade-in">
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-4">Financieel Dashboard</h2>
            
            <!-- Statistieken Kaarten -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                <p class="text-gray-400 text-sm font-medium uppercase">Totaal Inkomsten (Dit Jaar)</p>
                <p class="text-3xl font-bold text-green-400 mt-2">{{ totalStats().income | currency:'EUR':'symbol':'1.0-0' }}</p>
              </div>
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                <p class="text-gray-400 text-sm font-medium uppercase">Totaal Uitgaven (Dit Jaar)</p>
                <p class="text-3xl font-bold text-red-400 mt-2">{{ totalStats().expense | currency:'EUR':'symbol':'1.0-0' }}</p>
              </div>
              <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                <p class="text-gray-400 text-sm font-medium uppercase">Netto Resultaat</p>
                <p class="text-3xl font-bold mt-2" [ngClass]="{'text-green-400': totalStats().balance >= 0, 'text-red-400': totalStats().balance < 0}">
                  {{ totalStats().balance | currency:'EUR':'symbol':'1.0-0' }}
                </p>
              </div>
            </div>

            <!-- Matrix / Pivot Tabel -->
            <div class="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
              <div class="p-6 border-b border-gray-700 flex justify-between items-center">
                <h3 class="text-lg font-semibold">Categorieën per Maand (Laatste 6 maanden)</h3>
              </div>
              
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr class="bg-gray-900/50 text-gray-400 border-b border-gray-700">
                      <th class="p-4 font-medium sticky left-0 bg-gray-900 z-10 border-r border-gray-700">Categorie</th>
                      <th *ngFor="let m of matrixData().months" class="p-4 font-medium text-right min-w-[120px]">
                        {{ m | date:'MMM yyyy' }}
                      </th>
                      <th class="p-4 font-medium text-right bg-gray-900/30 border-l border-gray-700">Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let cat of matrixData().categories" class="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                      <td class="p-4 font-medium text-gray-200 sticky left-0 bg-gray-800 border-r border-gray-700">{{ cat }}</td>
                      <td *ngFor="let m of matrixData().months" class="p-4 text-right font-mono text-gray-300">
                        <span [class.text-gray-600]="getMatrixValue(cat, m) === 0">
                           {{ getMatrixValue(cat, m) | currency:'EUR':'symbol':'1.0-0' }}
                        </span>
                      </td>
                      <td class="p-4 text-right font-bold text-white bg-gray-900/20 border-l border-gray-700 font-mono">
                        {{ getMatrixRowTotal(cat) | currency:'EUR':'symbol':'1.0-0' }}
                      </td>
                    </tr>
                    <!-- Totaal Rij -->
                    <tr class="bg-gray-900 font-bold border-t-2 border-gray-600">
                      <td class="p-4 sticky left-0 bg-gray-900 border-r border-gray-700">Totaal per Maand</td>
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
        </div>

        <!-- VIEW: TRANSACTIONS -->
        <div *ngIf="activeTab() === 'transactions'" class="animate-fade-in">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h2 class="text-2xl font-bold">Alle Transacties</h2>
            <button (click)="openModal()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
              </svg>
              Nieuwe Transactie
            </button>
          </div>

          <!-- Filters -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <input 
              type="text" 
              placeholder="Zoeken op omschrijving..." 
              [(ngModel)]="searchTerm"
              class="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
            
            <select [(ngModel)]="categoryFilter" class="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none">
              <option value="ALL">Alle Categorieën</option>
              <option *ngFor="let cat of uniqueCategories()" [value]="cat">{{ cat }}</option>
            </select>

            <select [(ngModel)]="typeFilter" class="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none">
              <option value="ALL">Alle Types</option>
              <option value="income">Inkomsten</option>
              <option value="expense">Uitgaven</option>
            </select>
          </div>

          <!-- Lijst -->
          <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="bg-gray-900/50 text-gray-400 border-b border-gray-700">
                  <tr>
                    <th class="p-4 font-medium">Datum</th>
                    <th class="p-4 font-medium">Omschrijving</th>
                    <th class="p-4 font-medium">Categorie</th>
                    <th class="p-4 font-medium text-right">Bedrag</th>
                    <th class="p-4 font-medium text-right">Acties</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                  <tr *ngFor="let t of filteredTransactions()" class="group hover:bg-gray-700/50 transition-colors">
                    <td class="p-4 text-gray-300 whitespace-nowrap">{{ t.date | date:'dd-MM-yyyy' }}</td>
                    <td class="p-4 font-medium text-white">{{ t.description }}</td>
                    <td class="p-4">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600">
                        {{ t.category }}
                      </span>
                    </td>
                    <td class="p-4 text-right font-mono font-bold" 
                        [ngClass]="t.type === 'income' ? 'text-green-400' : 'text-red-400'">
                      {{ (t.type === 'income' ? '+' : '-') }} {{ t.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </td>
                    <td class="p-4 text-right space-x-2">
                      <button (click)="editTransaction(t)" class="text-blue-400 hover:text-blue-300 opacity-50 hover:opacity-100 transition-opacity">Bewerken</button>
                      <button (click)="deleteTransaction(t.id)" class="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-opacity">Verwijderen</button>
                    </td>
                  </tr>
                  <tr *ngIf="filteredTransactions().length === 0">
                    <td colspan="5" class="p-8 text-center text-gray-500">
                      Geen transacties gevonden voor deze filters.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- VIEW: SETTINGS -->
        <div *ngIf="activeTab() === 'settings'" class="animate-fade-in max-w-2xl mx-auto">
          <h2 class="text-2xl font-bold mb-6">Data Beheer</h2>
          
          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6 shadow-lg">
            <h3 class="text-lg font-semibold mb-4 text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
              Data Exporteren
            </h3>
            <p class="text-gray-400 mb-4 text-sm">Download al je transacties als een JSON bestand. Handig voor back-ups of migratie.</p>
            <button (click)="exportData()" class="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors border border-gray-600">
              Download JSON Backup
            </button>
          </div>

          <div class="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
            <h3 class="text-lg font-semibold mb-4 text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" transform="rotate(180 10 10)" /></svg>
              Data Importeren
            </h3>
            <p class="text-gray-400 mb-4 text-sm">Upload een eerder geëxporteerd JSON bestand. <span class="text-red-400">Let op: dit overschrijft je huidige data.</span></p>
            <input type="file" (change)="importData($event)" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"/>
          </div>
          
          <div class="mt-8 text-center">
            <button (click)="loadDummyData()" class="text-sm text-gray-500 hover:text-blue-400 underline">
              Laad voorbeeld data (om te testen)
            </button>
          </div>
        </div>

      </main>

      <!-- Modal voor Toevoegen/Bewerken -->
      <div *ngIf="showModal" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <!-- Achtergrond overlay -->
          <div class="fixed inset-0 bg-gray-950 bg-opacity-80 transition-opacity" (click)="closeModal()"></div>

          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

          <div class="inline-block align-bottom bg-gray-800 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-gray-700">
            <div class="px-6 py-5 border-b border-gray-700">
              <h3 class="text-lg font-medium leading-6 text-white" id="modal-title">
                {{ isEditing ? 'Transactie Bewerken' : 'Nieuwe Transactie' }}
              </h3>
            </div>
            <div class="px-6 py-5">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Type</label>
                  <div class="flex rounded-md shadow-sm" role="group">
                    <button type="button" (click)="currentTransaction.type = 'expense'" 
                      [class]="currentTransaction.type === 'expense' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
                      class="flex-1 px-4 py-2 text-sm font-medium rounded-l-lg border border-gray-600 focus:z-10 focus:ring-2 focus:ring-red-500">
                      Uitgave
                    </button>
                    <button type="button" (click)="currentTransaction.type = 'income'"
                      [class]="currentTransaction.type === 'income' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
                      class="flex-1 px-4 py-2 text-sm font-medium rounded-r-lg border border-gray-600 focus:z-10 focus:ring-2 focus:ring-green-500">
                      Inkomsten
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Omschrijving</label>
                  <input type="text" [(ngModel)]="currentTransaction.description" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Bedrag (€)</label>
                    <input type="number" [(ngModel)]="currentTransaction.amount" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-400 mb-1">Datum</label>
                    <input type="date" [(ngModel)]="currentTransaction.date" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Categorie</label>
                  <input type="text" list="categories" [(ngModel)]="currentTransaction.category" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Bv. Boodschappen, Huur...">
                  <datalist id="categories">
                    <option *ngFor="let cat of uniqueCategories()" [value]="cat"></option>
                  </datalist>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 bg-gray-700/50 flex flex-row-reverse gap-2">
              <button (click)="saveTransaction()" class="w-full sm:w-auto inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm">
                Opslaan
              </button>
              <button (click)="closeModal()" class="w-full sm:w-auto inline-flex justify-center rounded-lg border border-gray-600 shadow-sm px-4 py-2 bg-gray-800 text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:text-sm">
                Annuleren
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    /* Custom Scrollbar voor donkere modus */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #111827; 
    }
    ::-webkit-scrollbar-thumb {
      background: #374151; 
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #4B5563; 
    }
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class App {
  // State Signals
  activeTab = signal<'dashboard' | 'transactions' | 'settings'>('dashboard');
  transactions = signal<Transaction[]>([]);
  
  // Filters
  searchTerm = '';
  categoryFilter = 'ALL';
  typeFilter = 'ALL';

  // Modal State
  showModal = false;
  isEditing = false;
  currentTransaction: Transaction = this.getEmptyTransaction();

  constructor() {
    this.loadFromStorage();
    // Auto-save effect: Slaat data op bij elke wijziging in 'transactions'
    effect(() => {
      try {
        localStorage.setItem('financeData', JSON.stringify(this.transactions()));
      } catch (e) {
        console.warn('Opslaan mislukt', e);
      }
    });
  }

  // --- Computed Signals voor logica ---

  // 1. Gefilterde transacties
  filteredTransactions = computed(() => {
    return this.transactions()
      .filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
                              t.category.toLowerCase().includes(this.searchTerm.toLowerCase());
        const matchesCat = this.categoryFilter === 'ALL' || t.category === this.categoryFilter;
        const matchesType = this.typeFilter === 'ALL' || t.type === this.typeFilter;
        return matchesSearch && matchesCat && matchesType;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // 2. Unieke Categorieën
  uniqueCategories = computed(() => {
    const cats = new Set(this.transactions().map(t => t.category));
    return Array.from(cats).sort();
  });

  // 3. Totalen voor de bovenste kaarten (Huidige Jaar)
  totalStats = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    const txs = this.transactions().filter(t => new Date(t.date).getFullYear() === currentYear);
    
    const income = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    return { income, expense, balance: income - expense };
  });

  // 4. Matrix Data voor de tabel
  matrixData = computed(() => {
    const data = this.transactions();
    const today = new Date();
    const months: string[] = [];
    
    // Genereer sleutels voor de laatste 6 maanden (YYYY-MM)
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7); // "2023-10"
      months.push(monthStr);
    }

    // Welke categorieën zijn actief in deze periode?
    const activeCategories = new Set<string>();
    
    data.forEach(t => {
      const m = t.date.slice(0, 7);
      if (months.includes(m)) {
        activeCategories.add(t.category);
      }
    });

    return {
      months,
      categories: Array.from(activeCategories).sort()
    };
  });

  // --- Hulp Methodes ---

  getMatrixValue(category: string, month: string): number {
    return this.transactions()
      .filter(t => t.category === category && t.date.startsWith(month))
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  getMatrixRowTotal(category: string): number {
    const months = this.matrixData().months;
    return this.transactions()
      .filter(t => t.category === category && months.includes(t.date.slice(0, 7)))
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  getMonthTotal(month: string): number {
    return this.transactions()
      .filter(t => t.date.startsWith(month))
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  // --- Acties ---

  openModal(t?: Transaction) {
    if (t) {
      this.currentTransaction = { ...t };
      this.isEditing = true;
    } else {
      this.currentTransaction = this.getEmptyTransaction();
      this.isEditing = false;
    }
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveTransaction() {
    if (!this.currentTransaction.description || !this.currentTransaction.amount) return;

    if (this.isEditing) {
      this.transactions.update(items => 
        items.map(item => item.id === this.currentTransaction.id ? this.currentTransaction : item)
      );
    } else {
      this.currentTransaction.id = crypto.randomUUID();
      this.transactions.update(items => [...items, this.currentTransaction]);
    }
    this.closeModal();
  }

  deleteTransaction(id: string) {
    // Gebruik window.confirm (geen custom modal voor nu)
    if(confirm('Weet je zeker dat je deze transactie wilt verwijderen?')) {
      this.transactions.update(items => items.filter(t => t.id !== id));
    }
  }

  getEmptyTransaction(): Transaction {
    return {
      id: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount: 0,
      type: 'expense',
      category: 'Algemeen'
    };
  }

  // --- Data Management ---

  loadFromStorage() {
    const stored = localStorage.getItem('financeData');
    if (stored) {
      try {
        this.transactions.set(JSON.parse(stored));
      } catch (e) {
        console.error('Error parsing data', e);
      }
    }
  }

  exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.transactions()));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "finance_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  importData(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if(confirm('Dit overschrijft al je huidige data. Weet je het zeker?')) {
            this.transactions.set(data);
            alert('Data succesvol geïmporteerd!');
          }
        } else {
          alert('Ongeldig bestandsformaat.');
        }
      } catch (err) {
        alert('Fout bij lezen bestand.');
      }
    };
    reader.readAsText(file);
  }

  loadDummyData() {
    const categories = ['Boodschappen', 'Huur', 'Salaris', 'Verzekering', 'Uit eten', 'Vervoer'];
    const dummy: Transaction[] = [];
    const today = new Date();
    
    for(let i=0; i<50; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1);
        const isIncome = Math.random() > 0.7;
        const cat = isIncome ? 'Salaris' : categories[Math.floor(Math.random() * (categories.length - 1))];
        
        dummy.push({
            id: crypto.randomUUID(),
            date: date.toISOString().slice(0,10),
            description: isIncome ? 'Maandelijks inkomen' : `Betaling ${cat}`,
            amount: isIncome ? 2500 + Math.floor(Math.random() * 500) : 10 + Math.floor(Math.random() * 150),
            type: isIncome ? 'income' : 'expense',
            category: cat
        });
    }
    this.transactions.set(dummy);
  }
}
