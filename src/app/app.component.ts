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

interface CsvMapping {
  dateCol: number;
  descCol: number;
  amountCol: number;
  categoryCol?: number;
}

type Period = '1M' | '6M' | '1Y' | 'ALL';

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
            </div>
            
            <div class="flex space-x-1 sm:space-x-2">
              <button *ngFor="let tab of tabs"
                (click)="activeTab.set(tab.id)"
                [class]="activeTab() === tab.id ? 'bg-gray-800 text-blue-400 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
                class="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200">
                {{ tab.label }}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
        
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
            <div class="p-6 border-b border-gray-700">
              <h3 class="text-lg font-semibold text-white">Categorie Overzicht (Laatste 6 maanden)</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr class="bg-gray-900/50 text-gray-400 border-b border-gray-700">
                    <th class="p-4 font-medium sticky left-0 bg-gray-900 z-10 border-r border-gray-700">Categorie</th>
                    <th *ngFor="let m of matrixData().months" class="p-4 font-medium text-right min-w-[100px]">
                      {{ m | date:'MMM yy' }}
                    </th>
                    <th class="p-4 font-medium text-right bg-gray-900/30 border-l border-gray-700 text-white">Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let cat of matrixData().categories" class="border-b border-gray-700 hover:bg-gray-700/30 transition-colors">
                    <td class="p-4 font-medium text-gray-300 sticky left-0 bg-gray-800 border-r border-gray-700">{{ cat }}</td>
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
                    <td class="p-4 sticky left-0 bg-gray-900 border-r border-gray-700 text-blue-400">Totaal per Maand</td>
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
          <div class="flex justify-between items-center bg-gray-800 p-4 rounded-xl border border-gray-700">
            <h2 class="text-xl font-bold">Statistieken</h2>
            <div class="flex bg-gray-900 p-1 rounded-lg">
              <button *ngFor="let p of periods" 
                (click)="statsPeriod.set(p)"
                [class]="statsPeriod() === p ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'"
                class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">
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
                Balans Verloop
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
                <div class="flex justify-between mt-2 text-xs text-gray-500">
                    <span *ngFor="let point of lineChartData(); let i = index">
                       <span *ngIf="i % 2 === 0">{{ point.label }}</span>
                    </span>
                </div>
              </div>
            </div>

            <!-- 2. Uitgaven per Maand (Bar Chart) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg">
               <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                <span class="w-2 h-6 bg-red-500 rounded-full"></span>
                Uitgaven per Periode
              </h3>
              <div class="h-64 flex items-end justify-between gap-2">
                <div *ngFor="let item of barChartData()" class="flex-1 flex flex-col items-center group">
                  <div class="w-full bg-gray-700 rounded-t-sm relative transition-all duration-300 hover:bg-red-500/80" 
                       [style.height.%]="item.pct">
                       <!-- Tooltip -->
                       <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none transition-opacity border border-gray-600">
                         {{ item.value | currency:'EUR':'symbol':'1.0-0' }}
                       </div>
                  </div>
                  <span class="text-xs text-gray-500 mt-2 rotate-45 sm:rotate-0 origin-left truncate w-full text-center">{{ item.label }}</span>
                </div>
              </div>
            </div>

            <!-- 3. Uitgaven per Categorie (Pie Chart) -->
            <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-lg flex flex-col">
              <h3 class="text-lg font-semibold mb-6 flex items-center gap-2">
                <span class="w-2 h-6 bg-purple-500 rounded-full"></span>
                Verdeling Categorieën (Uitgaven)
              </h3>
              <div class="flex-1 flex items-center justify-center gap-8">
                <!-- Pie using Conic Gradient -->
                <div class="relative w-48 h-48 rounded-full shadow-2xl" 
                     [style.background]="getPieGradient()">
                     <div class="absolute inset-4 bg-gray-800 rounded-full flex items-center justify-center flex-col">
                        <span class="text-xs text-gray-400">Totaal</span>
                        <span class="font-bold text-white">{{ pieTotal() | currency:'EUR':'symbol':'1.0-0' }}</span>
                     </div>
                </div>
                <!-- Legend -->
                <div class="space-y-2 text-sm max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  <div *ngFor="let item of pieChartData()" class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" [style.background-color]="item.color"></span>
                    <span class="text-gray-300 flex-1">{{ item.label }}</span>
                    <span class="font-mono text-gray-400">{{ item.percentage }}%</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>


        <!-- === TRANSACTIONS VIEW === -->
        <div *ngIf="activeTab() === 'transactions'" class="animate-fade-in space-y-6">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 class="text-2xl font-bold">Transacties</h2>
            <div class="flex gap-2">
              <button *ngIf="filteredTransactions().length > 0" (click)="openBulkEdit()" 
                 class="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.414 2.586a2 2 0 00-2.828 0L7 9.414V13h3.586l6.828-6.828a2 2 0 000-2.828z" />
                  <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
                </svg>
                Bulk Bewerk ({{filteredTransactions().length}})
              </button>
              <button (click)="openModal()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                </svg>
                Nieuw
              </button>
            </div>
          </div>

          <!-- Filters -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm">
            <div class="relative">
               <svg class="absolute left-3 top-3 h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
               <!-- FIXED: Using [ngModel] and (ngModelChange) with signals -->
               <input 
                type="text" 
                placeholder="Zoek op omschrijving..." 
                [ngModel]="searchTerm()" 
                (ngModelChange)="searchTerm.set($event)"
                class="w-full bg-gray-900 border border-gray-600 text-white rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow">
            </div>
            
            <select [ngModel]="categoryFilter()" (ngModelChange)="categoryFilter.set($event)" class="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer">
              <option value="ALL">Alle Categorieën</option>
              <option *ngFor="let cat of uniqueCategories()" [value]="cat">{{ cat }}</option>
            </select>

            <select [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)" class="bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer">
              <option value="ALL">Alle Types</option>
              <option value="income">Inkomsten</option>
              <option value="expense">Uitgaven</option>
            </select>
          </div>

          <!-- List -->
          <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="bg-gray-900/50 text-gray-400 border-b border-gray-700 text-sm uppercase tracking-wider">
                  <tr>
                    <th class="p-4 font-semibold">Datum</th>
                    <th class="p-4 font-semibold">Omschrijving</th>
                    <th class="p-4 font-semibold">Categorie</th>
                    <th class="p-4 font-semibold text-right">Bedrag</th>
                    <th class="p-4 font-semibold text-right">Actie</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                  <tr *ngFor="let t of filteredTransactions()" class="group hover:bg-gray-700/50 transition-colors">
                    <td class="p-4 text-gray-300 whitespace-nowrap font-mono text-sm">{{ t.date | date:'dd-MM-yyyy' }}</td>
                    <td class="p-4 font-medium text-white">{{ t.description }}</td>
                    <td class="p-4">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600">
                        {{ t.category }}
                      </span>
                    </td>
                    <td class="p-4 text-right font-mono font-bold" 
                        [ngClass]="t.type === 'income' ? 'text-green-400' : 'text-red-400'">
                      {{ (t.type === 'income' ? '+' : '-') }} {{ t.amount | currency:'EUR':'symbol':'1.2-2' }}
                    </td>
                    <td class="p-4 text-right">
                      <div class="flex justify-end gap-2 opacity-100 transition-opacity">
                         <button (click)="$event.stopPropagation(); editTransaction(t)" class="p-1 hover:bg-blue-900/50 rounded text-blue-400 cursor-pointer" title="Bewerken">
                           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                         </button>
                         <button (click)="$event.stopPropagation(); deleteTransaction(t.id)" class="p-1 hover:bg-red-900/50 rounded text-red-400 cursor-pointer" title="Verwijderen">
                           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                         </button>
                      </div>
                    </td>
                  </tr>
                  <tr *ngIf="filteredTransactions().length === 0">
                    <td colspan="5" class="p-12 text-center">
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
             <div class="flex gap-4">
                <div class="flex-1">
                  <h3 class="text-lg font-semibold mb-2 text-white">Backup Maken</h3>
                  <p class="text-xs text-gray-400 mb-4">Download al je data als JSON bestand.</p>
                  <button (click)="exportData()" class="text-sm bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg border border-gray-600 w-full transition-colors">Download</button>
                </div>
                <div class="w-px bg-gray-700"></div>
                <div class="flex-1">
                   <h3 class="text-lg font-semibold mb-2 text-white">Backup Herstellen</h3>
                   <p class="text-xs text-gray-400 mb-4">Overschrijft huidige data!</p>
                   <input type="file" (change)="importJson($event)" class="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer"/>
                </div>
             </div>
          </div>
          
          <div class="mt-8 text-center">
            <button (click)="loadDummyData()" class="text-sm text-gray-500 hover:text-blue-400 underline">
              Reset & Laad voorbeeld data
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
                  <input type="text" [(ngModel)]="currentTransaction.description" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="Bijv. Albert Heijn">
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

                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">Categorie</label>
                  <div class="relative">
                    <input type="text" list="categories" [(ngModel)]="currentTransaction.category" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow" placeholder="Zoek of typ nieuw...">
                    <datalist id="categories">
                      <option *ngFor="let cat of uniqueCategories()" [value]="cat"></option>
                    </datalist>
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
                </div>
             </div>

             <div class="px-6 py-4 bg-gray-900/50 flex justify-end gap-3 border-t border-gray-700">
                <button (click)="processCsvImport()" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
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

             <div class="mb-6">
                <label class="block text-sm font-medium text-gray-400 mb-1">Nieuwe Categorie</label>
                <!-- FIXED: Dropdown for Bulk Edit -->
                <select [(ngModel)]="bulkEditCategory" class="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 appearance-none">
                  <option value="" disabled selected>Kies een categorie...</option>
                  <option *ngFor="let cat of uniqueCategories()" [value]="cat">{{ cat }}</option>
                  <option value="NEW">+ Nieuwe Categorie (Typ in lijst)</option>
                </select>
                <!-- Fallback input if they select NEW or want to type -->
                <input *ngIf="bulkEditCategory === 'NEW'" type="text" [(ngModel)]="bulkEditCustomCategory" placeholder="Typ nieuwe categorie..." class="mt-2 w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500">
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
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #111827; }
    ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #4B5563; }
    .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  `]
})
export class App {
  // Navigation
  tabs = [
    { id: 'dashboard', label: 'Overzicht' },
    { id: 'transactions', label: 'Transacties' },
    { id: 'stats', label: 'Statistieken' },
    { id: 'settings', label: 'Beheer' }
  ];
  activeTab = signal<string>('dashboard');

  // Data
  transactions = signal<Transaction[]>([]);
  
  // Transaction List Filters (Now Signals!)
  searchTerm = signal('');
  categoryFilter = signal('ALL');
  typeFilter = signal('ALL');

  // Stats State
  statsPeriod = signal<Period>('6M');
  periods: Period[] = ['1M', '6M', '1Y', 'ALL'];

  // Transaction Modal State
  showModal = false;
  isEditing = false;
  currentTransaction: Transaction = this.getEmptyTransaction();

  // CSV Import State
  showCsvModal = false;
  csvRawData: string[][] = [];
  csvPreviewHeaders: string[] = [];
  csvPreviewRow: string[] = [];
  csvMapping: CsvMapping = { dateCol: 0, descCol: 1, amountCol: 2 };

  // Bulk Edit State
  showBulkEditModal = false;
  bulkEditCategory = '';
  bulkEditCustomCategory = '';

  constructor() {
    this.loadFromStorage();
    effect(() => {
      try { localStorage.setItem('financeData', JSON.stringify(this.transactions())); } catch (e) {}
    });
  }

  // --- COMPUTES ---

  // Main Filter Logic (Updated to use signals correctly)
  filteredTransactions = computed(() => {
    // We read signals here: this.searchTerm(), this.categoryFilter(), etc.
    // Because we read them, Angular knows to re-run this function when they change.
    const term = this.searchTerm().toLowerCase();
    const catFilter = this.categoryFilter();
    const tFilter = this.typeFilter();

    return this.transactions()
      .filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(term) || 
                              t.category.toLowerCase().includes(term);
        const matchesCat = catFilter === 'ALL' || t.category === catFilter;
        const matchesType = tFilter === 'ALL' || t.type === tFilter;
        return matchesSearch && matchesCat && matchesType;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // Unique Categories
  uniqueCategories = computed(() => {
    const cats = new Set(this.transactions().map(t => t.category));
    return Array.from(cats).sort();
  });

  // Top Cards Stats
  totalStats = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const txs = this.transactions().filter(t => new Date(t.date).getFullYear() === currentYear);
    const income = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  });

  // Matrix Data
  matrixData = computed(() => {
    const data = this.transactions();
    const today = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const activeCategories = new Set<string>();
    data.forEach(t => {
      if (months.includes(t.date.slice(0, 7))) activeCategories.add(t.category);
    });
    return { months, categories: Array.from(activeCategories).sort() };
  });

  // --- STATS CHARTS COMPUTES ---
  
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

  barChartData = computed(() => {
    const txs = this.statsFilteredData();
    const buckets = new Map<string, number>(); 
    
    txs.forEach(t => {
      if (t.type === 'expense') {
        const key = t.date.slice(0, 7);
        buckets.set(key, (buckets.get(key) || 0) + t.amount);
      }
    });

    const sortedKeys = Array.from(buckets.keys()).sort();
    const data = sortedKeys.map(key => ({
       label: key.slice(5), 
       fullLabel: key,
       value: buckets.get(key) || 0
    }));

    const max = Math.max(...data.map(d => d.value), 1);
    return data.map(d => ({ ...d, pct: (d.value / max) * 100 }));
  });

  lineChartData = computed(() => {
    const txs = this.statsFilteredData();
    const sortedTxs = [...txs].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const points: {x: number, y: number, label: string, value: number}[] = [];
    const groupedByDay = new Map<string, number>();
    
    sortedTxs.forEach(t => {
        const d = t.date;
        const change = t.type === 'income' ? t.amount : -t.amount;
        groupedByDay.set(d, (groupedByDay.get(d) || 0) + change);
    });

    let cumulative = 0;
    const days = Array.from(groupedByDay.keys()).sort();
    
    if (days.length === 0) return [];

    days.forEach((day, index) => {
        cumulative += groupedByDay.get(day)!;
        points.push({
            x: 0, 
            y: 0, 
            label: day.slice(5), 
            value: cumulative
        });
    });

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

    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];
    let colorIdx = 0;

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1]) 
      .map(([cat, val]) => ({
          label: cat,
          value: val,
          percentage: totalExp ? Math.round((val / totalExp) * 100) : 0,
          color: colors[colorIdx++ % colors.length]
      }));
  });
  
  pieTotal = computed(() => this.statsFilteredData().filter(t => t.type === 'expense').reduce((sum,t) => sum+t.amount,0));

  getPieGradient() {
    const data = this.pieChartData();
    if (!data.length) return 'gray';
    
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

  // --- ACTIONS ---

  // Bulk Edit
  openBulkEdit() {
      this.bulkEditCategory = '';
      this.bulkEditCustomCategory = '';
      this.showBulkEditModal = true;
  }
  
  applyBulkEdit() {
      // Determine final category (Dropdown or Custom Input)
      let finalCat = this.bulkEditCategory;
      if (finalCat === 'NEW') {
        finalCat = this.bulkEditCustomCategory;
      }

      if (!finalCat) return;

      const filteredIds = this.filteredTransactions().map(t => t.id);
      
      this.transactions.update(current => 
         current.map(t => {
             if (filteredIds.includes(t.id)) {
                 return { ...t, category: finalCat };
             }
             return t;
         })
      );
      this.showBulkEditModal = false;
      alert(`${filteredIds.length} transacties bijgewerkt.`);
  }

  // CSV Import
  handleCsvFile(event: any) {
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

  processCsvImport() {
      const { dateCol, descCol, amountCol } = this.csvMapping;
      const dataRows = this.csvRawData.slice(1); 
      const newTxs: Transaction[] = [];
      let skipped = 0;

      dataRows.forEach(row => {
          if (row.length < Math.max(dateCol, descCol, amountCol)) return;

          try {
              let amountStr = row[amountCol];
              amountStr = amountStr.replace(/\./g, '').replace(',', '.');
              let amount = parseFloat(amountStr);
              
              if (isNaN(amount)) { skipped++; return; }

              let dateRaw = row[dateCol];
              let date = new Date(dateRaw).toISOString().slice(0, 10);
              if (dateRaw.includes('-') && dateRaw.split('-')[0].length === 2) {
                   const parts = dateRaw.split('-');
                   date = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }

              const type = amount >= 0 ? 'income' : 'expense';

              newTxs.push({
                  id: crypto.randomUUID(),
                  date: date,
                  description: row[descCol],
                  amount: Math.abs(amount),
                  type: type,
                  category: 'Onbekend' 
              });
          } catch (e) {
              skipped++;
          }
      });

      this.transactions.update(curr => [...curr, ...newTxs]);
      this.showCsvModal = false;
      alert(`${newTxs.length} transacties geïmporteerd. (${skipped} overgeslagen)`);
  }

  // Basic CRUD
  openModal(t?: Transaction) {
    if (t) { this.currentTransaction = { ...t }; this.isEditing = true; }
    else { this.currentTransaction = this.getEmptyTransaction(); this.isEditing = false; }
    this.showModal = true;
  }
  closeModal() { this.showModal = false; }
  saveTransaction() {
    if (!this.currentTransaction.description || !this.currentTransaction.amount) return;
    if (this.isEditing) {
      this.transactions.update(items => items.map(item => item.id === this.currentTransaction.id ? this.currentTransaction : item));
    } else {
      this.currentTransaction.id = crypto.randomUUID();
      this.transactions.update(items => [...items, this.currentTransaction]);
    }
    this.closeModal();
  }
  deleteTransaction(id: string) { if(confirm('Verwijderen?')) this.transactions.update(items => items.filter(t => t.id !== id)); }
  getEmptyTransaction(): Transaction { return { id: '', date: new Date().toISOString().slice(0, 10), description: '', amount: 0, type: 'expense', category: 'Algemeen' }; }
  
  // Matrix Helpers
  getMatrixValue(category: string, month: string): number {
    return this.transactions().filter(t => t.category === category && t.date.startsWith(month)).reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }
  getMatrixRowTotal(category: string): number {
    const months = this.matrixData().months;
    return this.transactions().filter(t => t.category === category && months.includes(t.date.slice(0, 7))).reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }
  // NEW: Total per Month Helper
  getMonthTotal(month: string): number {
    return this.transactions()
      .filter(t => t.date.startsWith(month))
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  // Backup
  loadFromStorage() { const s = localStorage.getItem('financeData'); if(s) this.transactions.set(JSON.parse(s)); }
  exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.transactions()));
    const a = document.createElement('a'); a.href = dataStr; a.download = "backup.json"; document.body.appendChild(a); a.click(); a.remove();
  }
  importJson(e: any) {
      const f = e.target.files[0]; if(!f) return;
      const r = new FileReader(); r.onload = (ev: any) => { this.transactions.set(JSON.parse(ev.target.result)); alert('Hersteld!'); }; r.readAsText(f);
  }
  loadDummyData() {
    const cats = ['Boodschappen', 'Huur', 'Salaris', 'Verzekering', 'Uit eten', 'Vervoer', 'Abonnementen', 'Kleding'];
    const dummy: Transaction[] = [];
    const today = new Date();
    for(let i=0; i<80; i++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.floor(Math.random() * 365));
        const isIncome = Math.random() > 0.8;
        const cat = isIncome ? 'Salaris' : cats[Math.floor(Math.random() * (cats.length - 1))];
        dummy.push({
            id: crypto.randomUUID(),
            date: date.toISOString().slice(0,10),
            description: isIncome ? 'Werkgever BV' : `Betaling aan ${cat}`,
            amount: isIncome ? 2500 + Math.floor(Math.random() * 500) : 5 + Math.floor(Math.random() * 200),
            type: isIncome ? 'income' : 'expense',
            category: cat
        });
    }
    this.transactions.set(dummy);
  }
}
