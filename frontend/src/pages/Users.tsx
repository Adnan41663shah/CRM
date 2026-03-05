import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Search, Users as UsersIcon, Edit3, Trash2 } from 'lucide-react';
import apiService, { safeToast } from '@/services/api';
import { User, UserRole } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import { cn } from '@/utils/cn';

const Users: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ 
    name: '', 
    email: '', 
    role: 'presales' as UserRole, 
    isActive: true, 
    centerPermissions: [] as string[]
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isFirstAdmin, setIsFirstAdmin] = useState(false);

  // Local users query
  const { data: localData, isLoading: isLoadingLocal } = useQuery(
    ['admin-users', search, roleFilter, page, limit],
    () => apiService.users.getAll({ search, role: roleFilter || undefined, page, limit }),
    {
      keepPreviousData: true
    }
  );

  const localUsers: User[] = useMemo(() => localData?.data?.users || [], [localData]);
  const pagination = localData?.data?.pagination;

  // Fetch centers for multi-select
  const { data: optionsData } = useQuery(
    ['options'],
    () => apiService.options.get(),
    {
      staleTime: 60 * 1000,
    }
  );
  const availableCenters: string[] = useMemo(() => optionsData?.data?.locations || [], [optionsData]);

  const isLoading = isLoadingLocal;
  const users = localUsers;

  const openEdit = async (u: User) => {
    const user = u;
    setEditingUser(user);
    setForm({ 
      name: user.name, 
      email: user.email, 
      role: user.role, 
      isActive: user.isActive, 
      centerPermissions: user.centerPermissions || []
    });
    
    // Check if this user is the first admin
    if (user.role === 'admin') {
      try {
        // Fetch all admins to find the first one
        const adminsResponse = await apiService.users.getAll({ role: 'admin', limit: 1000 });
        const admins = adminsResponse.data?.users || [];
        if (admins.length > 0) {
          // Sort by createdAt to find the first admin
          const sortedAdmins = [...admins].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const firstAdmin = sortedAdmins[0];
          const userId = user.id || (user as any)._id;
          const firstAdminId = firstAdmin.id || (firstAdmin as any)._id;
          setIsFirstAdmin(userId === firstAdminId);
        } else {
          setIsFirstAdmin(false);
        }
      } catch (error) {
        setIsFirstAdmin(false);
      }
    } else {
      setIsFirstAdmin(false);
    }
    
    setShowModal(true);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1); // Reset to first page when search changes
  };

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value);
    setPage(1); // Reset to first page when role filter changes
  };

  const saveUser = async () => {
    try {
      setIsSaving(true);
      const payload: any = { 
        name: form.name, 
        email: form.email, 
        role: form.role, 
        isActive: form.isActive,
        centerPermissions: form.centerPermissions 
      };
      
      if (editingUser) {
        await apiService.users.update(editingUser.id || (editingUser as any)._id, payload);
        setShowModal(false);
        queryClient.invalidateQueries(['admin-users']);
        safeToast.success('User updated successfully');
      }
    } catch (error: any) {
      // Show error message from backend
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save user';
      safeToast.error(errorMessage);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (u: User) => {
    const user = u;
    try {
      await apiService.users.toggleStatus(user.id || (user as any)._id);
      queryClient.invalidateQueries(['admin-users']);
    } catch (error: any) {
      // Silently handle the error - show toast message from backend
      // The error is expected (e.g., trying to deactivate own account)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to toggle user status';
      safeToast.error(errorMessage);
      // Don't re-throw to prevent unhandled promise rejection
    }
  };

  const deleteUser = async (u: User) => {
    if (!confirm('Delete this user?')) return;
    try {
      await apiService.users.delete(u.id || (u as any)._id);
      queryClient.invalidateQueries(['admin-users']);
      safeToast.success('User deleted successfully');
    } catch (error: any) {
      // Show error message from backend
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete user';
      safeToast.error(errorMessage);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-secondary-900 dark:text-white">Users</h1>
          <p className="mt-1 text-xs sm:text-sm text-secondary-500 dark:text-secondary-400">
            Manage system users and permissions
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-content p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="md:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
                <input className="input pl-10! sm:!pl-12 text-xs sm:text-sm" placeholder="Search by name or email" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Filter by Role
              </label>
              <select
                className="input text-xs sm:text-sm"
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="presales">Presales</option>
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          {pagination && (pagination.totalPages > 0 || users.length > 0) && !isLoading && users.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-secondary-700 dark:text-secondary-300">
                Showing {users.length} of {pagination.totalUsers || pagination.totalItems || users.length} results
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[12rem] sm:min-h-[16rem]">
              <LoadingSpinner size="lg" label="Loading users..." />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Name</th>
                    <th className="hidden sm:table-cell px-3 py-1.5 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Role</th>
                    <th className="hidden md:table-cell px-3 py-1.5 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-1.5 text-right text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((u) => (
                      <tr key={u.id || (u as any)._id} className={cn(
                        "hover:bg-gray-50 dark:hover:bg-gray-800",
                        u.role === 'admin' && "bg-purple-50 dark:bg-purple-900/20"
                      )}>
                        <td className="px-3 py-1 whitespace-nowrap text-xs text-secondary-900 dark:text-white">{u.name}</td>
                        <td className="hidden sm:table-cell px-3 py-1 whitespace-nowrap text-xs text-secondary-900 dark:text-white">{u.email}</td>
                        <td className="px-3 py-1 whitespace-nowrap">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                            u.role === 'admin' && "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
                            u.role === 'presales' && "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
                            u.role === 'sales' && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="hidden md:table-cell px-3 py-1 whitespace-nowrap">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', u.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200')}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-1 whitespace-nowrap text-right text-xs font-medium">
                          <div className="flex items-center justify-end gap-1">
                            <button className="btn btn-outline btn-xs text-xs px-1 py-0.5" onClick={() => toggleStatus(u)}>
                              <span className="hidden sm:inline">{u.isActive ? 'Deactivate' : 'Activate'}</span>
                              <span className="sm:hidden">{u.isActive ? 'Off' : 'On'}</span>
                            </button>
                            <button className="btn btn-secondary btn-xs text-xs px-1 py-0.5" onClick={() => openEdit(u)}>
                              <Edit3 className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button className="btn btn-ghost btn-xs text-xs px-1 py-0.5" onClick={() => deleteUser(u)}>
                              <Trash2 className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && (pagination.totalPages > 0 || users.length > 0) && (
            <div className="card-footer">
              <div className="">
                <div className="flex space-x-2 my-4">
                  <button
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={!pagination.hasPrev}
                    className="btn btn-outline btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="flex items-center px-3 py-1 text-sm text-secondary-700 dark:text-secondary-300">
                    Page {pagination.currentPage} of {pagination.totalPages || 1}
                  </span>
                  <button
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={!pagination.hasNext}
                    className="btn btn-outline btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-4 sm:p-6 mx-4 sm:mx-0 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-secondary-900 dark:text-white">Edit User</h3>
                <button className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xl sm:text-2xl" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">Name</label>
                <input className="input text-xs sm:text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">Email</label>
                <input className="input text-xs sm:text-sm" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">Role</label>
                <select 
                  className="input text-xs sm:text-sm" 
                  value={form.role} 
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  disabled={isFirstAdmin && editingUser?.role === 'admin'}
                >
                  <option value="presales">Presales</option>
                  <option value="sales">Sales</option>
                  <option value="admin">Admin</option>
                </select>
                {isFirstAdmin && editingUser?.role === 'admin' && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    The first admin cannot change their own role.
                  </p>
                )}
              </div>

              {/* Center Permissions Section */}
              <div className="md:col-span-2 mt-4 pt-4 border-t border-secondary-100 dark:border-secondary-700/50">
                <label className="block text-xs sm:text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Center Permissions
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-secondary-50 dark:bg-secondary-900/50 rounded-lg border border-secondary-200 dark:border-secondary-700">
                  {availableCenters.length === 0 ? (
                    <p className="col-span-full text-xs text-secondary-500 italic">No centers configured. Add them in Options Settings.</p>
                  ) : (
                    availableCenters.map(center => (
                      <label key={center} className="flex items-center gap-2 group cursor-pointer">
                        <input 
                          type="checkbox"
                          className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                          checked={form.centerPermissions.includes(center)}
                          onChange={(e) => {
                            const newPerms = e.target.checked
                              ? [...form.centerPermissions, center]
                              : form.centerPermissions.filter(p => p !== center);
                            setForm({ ...form, centerPermissions: newPerms });
                          }}
                        />
                        <span className="text-xs text-secondary-700 dark:text-secondary-300 group-hover:text-secondary-900 dark:group-hover:text-white transition-colors">
                          {center}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="mt-2 text-[10px] text-secondary-500">
                  Select the centers the user is allowed to access. (Applies to Sales role)
                </p>
              </div>
            </div>
            <div className="mt-4 sm:mt-6 flex items-center justify-end gap-2 sm:gap-3">
              <button className="btn btn-cancel btn-sm text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2" onClick={() => setShowModal(false)} disabled={isSaving}>Cancel</button>
              <button className="btn btn-primary btn-sm text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2" onClick={saveUser} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
