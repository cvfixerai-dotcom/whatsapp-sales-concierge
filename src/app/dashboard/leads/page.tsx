// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  Row,
} from '@tanstack/react-table';
import { supabase } from '@/lib/supabase-client';
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Phone,
  Mail,
  MessageSquare,
  User,
  Calendar,
  Search,
  Filter,
  Download,
  Users,
  Eye,
  Edit,
  UserPlus,
  Plus,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  whatsapp_number: string;
  email?: string;
  lead_score: number;
  temperature: string;
  timeline?: string;
  budget_range?: string;
  service_interest?: string;
  last_message_time: string;
  message_count: number;
  qualification_status: string;
  assigned_agent_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: string;
  messages: Array<{
    content: string;
    sender_type: string;
    created_at: string;
  }>;
}

const temperatureColors = {
  new: 'bg-gray-100 text-gray-800',
  warm: 'bg-yellow-100 text-yellow-800',
  hot: 'bg-red-100 text-red-800',
  cold: 'bg-blue-100 text-blue-800',
  booked: 'bg-green-100 text-green-800',
};

const scoreColors = {
  low: 'bg-red-500',
  medium: 'bg-yellow-500',
  high: 'bg-green-500',
};

export default function LeadsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Conversation | null>(null);
  
  // Table states
  const [sorting, setSorting] = useState<SortingState>([{ id: 'last_message_time', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  
  // Filter states
  const [temperatureFilter, setTemperatureFilter] = useState('all');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [searchQuery, setSearchQuery] = useState('');

  // Edit states
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchLeads();
    }
  }, [status, session, temperatureFilter, timelineFilter, dateRange, searchQuery]);

  const fetchLeads = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      let query = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', session.user.tenantId)
        .order('last_message_time', { ascending: false });

      // Apply filters
      if (temperatureFilter !== 'all') {
        query = query.eq('temperature', temperatureFilter);
      }
      if (timelineFilter !== 'all') {
        query = query.eq('timeline', timelineFilter);
      }
      if (dateRange.start) {
        query = query.gte('created_at', dateRange.start);
      }
      if (dateRange.end) {
        query = query.lte('created_at', dateRange.end);
      }
      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,whatsapp_number.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversationHistory = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          messages(content, sender_type, created_at)
        `)
        .eq('contact_id', leadId)
        .single();

      if (error) throw error;
      setConversationHistory(data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  const handleViewLead = (lead: Lead) => {
    setSelectedLead(lead);
    setEditForm(lead);
    setNotes(lead.notes || '');
    fetchConversationHistory(lead.id);
    setShowDetailModal(true);
  };

  const handleUpdateLead = async () => {
    if (!editingLead) return;

    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          ...editForm,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingLead.id);

      if (error) throw error;
      
      fetchLeads();
      setEditingLead(null);
      alert('Lead updated successfully!');
    } catch (error) {
      console.error('Error updating lead:', error);
      alert('Failed to update lead');
    }
  };

  const handleBulkExport = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedLeads = selectedRows.map(row => row.original);
    
    const csv = [
      'Name,Phone,Email,Lead Score,Temperature,Timeline,Budget,Service Interest,Last Message',
      ...selectedLeads.map(lead => 
        `${lead.name},${lead.whatsapp_number},${lead.email || ''},${lead.lead_score},${lead.temperature},${lead.timeline || ''},${lead.budget_range || ''},${lead.service_interest || ''},${lead.last_message_time}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads_export.csv';
    a.click();
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return scoreColors.high;
    if (score >= 40) return scoreColors.medium;
    return scoreColors.low;
  };

  const columns: ColumnDef<Lead>[] = [
    {
      accessorKey: 'name',
      header: 'Contact',
      cell: ({ row }) => (
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{row.getValue('name')}</p>
            <p className="text-sm text-gray-500">{row.getValue('whatsapp_number')}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="flex items-center">
          <Mail className="w-4 h-4 mr-2 text-gray-400" />
          <span className="text-sm">{row.getValue('email') || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'lead_score',
      header: 'Lead Score',
      cell: ({ row }) => {
        const score = row.getValue('lead_score') as number;
        return (
          <div className="flex items-center space-x-2">
            <div className="w-24 bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${getScoreColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-sm font-medium">{score}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'temperature',
      header: 'Temperature',
      cell: ({ row }) => {
        const temp = row.getValue('temperature') as string;
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${temperatureColors[temp as keyof typeof temperatureColors]}`}>
            {temp}
          </span>
        );
      },
      filterFn: (row, id, value) => {
        return value === 'all' || row.getValue(id) === value;
      },
    },
    {
      accessorKey: 'timeline',
      header: 'Timeline',
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">{row.getValue('timeline') || '-'}</span>
      ),
    },
    {
      accessorKey: 'last_message_time',
      header: 'Last Message',
      cell: ({ row }) => {
        const date = new Date(row.getValue('last_message_time'));
        return (
          <span className="text-sm text-gray-900">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleViewLead(row.original)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Eye className="w-4 h-4 text-gray-600" />
          </button>
          <button className="p-1 hover:bg-gray-100 rounded">
            <Edit className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: leads,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  });

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Leads Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button className="p-2 rounded-md hover:bg-gray-100">
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-screen">
          <nav className="mt-5 px-2">
            <a href="/dashboard" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md">
              <Activity className="mr-3 h-5 w-5" />
              Dashboard
            </a>
            <a href="/dashboard/leads" className="bg-gray-100 text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Users className="mr-3 h-5 w-5" />
              Leads
            </a>
            <a href="/dashboard/calendar" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Calendar className="mr-3 h-5 w-5" />
              Calendar
            </a>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Filter Bar */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by name, phone, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Temperature Filter */}
              <select
                value={temperatureFilter}
                onChange={(e) => setTemperatureFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Temperatures</option>
                <option value="new">New</option>
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
                <option value="cold">Cold</option>
                <option value="booked">Booked</option>
              </select>

              {/* Timeline Filter */}
              <select
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Timelines</option>
                <option value="urgent">Urgent</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="exploring">Exploring</option>
              </select>

              {/* Date Range */}
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />

              {/* Bulk Actions */}
              {table.getFilteredSelectedRowModel().rows.length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {table.getFilteredSelectedRowModel().rows.length} selected
                  </span>
                  <button
                    onClick={handleBulkExport}
                    className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">All Leads ({leads.length})</h2>
                <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Lead
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {header.isPlaceholder ? null : (
                            <div
                              className={header.column.getCanSort() ? 'cursor-pointer select-none flex items-center' : ''}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() && (
                                <span className="ml-2">
                                  {header.column.getIsSorted() === 'desc' ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : header.column.getIsSorted() === 'asc' ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-4 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {pagination.pageIndex * pagination.pageSize + 1} to{' '}
                  {Math.min((pagination.pageIndex + 1) * pagination.pageSize, leads.length)} of{' '}
                  {leads.length} results
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Lead Detail Modal */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Lead Details</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-md"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contact Information */}
                <div className="lg:col-span-1">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Name</label>
                      {editingLead?.id === selectedLead.id ? (
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-gray-900">{selectedLead.name}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phone</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLead.whatsapp_number}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      {editingLead?.id === selectedLead.id ? (
                        <input
                          type="email"
                          value={editForm.email || ''}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-gray-900">{selectedLead.email || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Lead Score</label>
                      <div className="mt-1 flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getScoreColor(selectedLead.lead_score)}`}
                            style={{ width: `${selectedLead.lead_score}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{selectedLead.lead_score}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Temperature</label>
                      {editingLead?.id === selectedLead.id ? (
                        <select
                          value={editForm.temperature || ''}
                          onChange={(e) => setEditForm({ ...editForm, temperature: e.target.value })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                          <option value="new">New</option>
                          <option value="warm">Warm</option>
                          <option value="hot">Hot</option>
                          <option value="cold">Cold</option>
                          <option value="booked">Booked</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${temperatureColors[selectedLead.temperature as keyof typeof temperatureColors]}`}>
                          {selectedLead.temperature}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex space-x-2">
                    {editingLead?.id === selectedLead.id ? (
                      <>
                        <button
                          onClick={handleUpdateLead}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Save
                        </button>
                        <button
                          onClick={() => setEditingLead(null)}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingLead(selectedLead)}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </button>
                        <button className="flex-1 flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Handoff
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Conversation History */}
                <div className="lg:col-span-2">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Conversation History</h3>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {conversationHistory?.messages?.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.sender_type === 'contact' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-xs px-4 py-2 rounded-lg ${
                            message.sender_type === 'contact'
                              ? 'bg-gray-100 text-gray-900'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p className={`text-xs mt-1 ${
                            message.sender_type === 'contact' ? 'text-gray-500' : 'text-blue-100'
                          }`}>
                            {new Date(message.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add notes about this lead..."
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
