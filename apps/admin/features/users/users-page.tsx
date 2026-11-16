'use client';

import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_ROLES,
  type AdminOwnerItem,
  type AdminStaffItem,
  type AdminUserItem,
  OWNER_ACCOUNT_STATES,
  PASSWORD_MIN_LENGTH,
  type Paginated,
  STAFF_ROLES,
  type SentLink,
} from '@gearva/contracts';
import { Alert, Button, Card, Field, Input, Select } from '@gearva/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error';
import { Pager } from '@/components/pager';
import { Table, Td } from '@/components/table';
import { useAdmin } from '@/features/auth/use-admin';
import { api, apiPatch, apiPost } from '@/lib/api';
import { useDates } from '@/lib/format';

const TABS = ['admins', 'staff', 'owners'] as const;
type Tab = (typeof TABS)[number];

/**
 * flow.md 11.8 (step 5.9): the super admin's Users page. Admins, every garage's staff and
 * the car owners with their actions. The API refuses everyone else too.
 */
export function UsersPage() {
  const t = useTranslations('users');
  const admin = useAdmin();
  const [tab, setTab] = useState<Tab>('admins');
  if (!admin.data) return null;
  if (admin.data.role !== 'SUPER_ADMIN') return <Alert>{t('superOnly')}</Alert>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('lead')}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((name) => (
          <Button
            key={name}
            role="tab"
            aria-selected={tab === name}
            variant={tab === name ? 'primary' : 'secondary'}
            onClick={() => setTab(name)}
          >
            {t(`tabs.${name}`)}
          </Button>
        ))}
      </div>
      {tab === 'admins' && <AdminsTab myId={admin.data.id} />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'owners' && <OwnersTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** A row's actions, opened under the row. */
function Actions({ children }: { children: ReactNode }) {
  return <div className="space-y-3 bg-soft px-4 py-4">{children}</div>;
}

/** Types a new password for someone else; the admin tells it to the person. */
function SetPassword({
  url,
  min,
  onDone,
}: {
  url: string;
  min: number;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('users');
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => apiPost<void>(url, { password }),
    onSuccess: () => {
      setPassword('');
      onDone(t('passwordSet'));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length >= min) save.mutate();
  };
  return (
    <form className="space-y-2" onSubmit={submit}>
      <Field label={t('newPassword')} hint={t('newPasswordHint', { min })}>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <ApiErrorAlert error={save.error} />
      <Button type="submit" variant="secondary" disabled={save.isPending || password.length < min}>
        {t('setPassword')}
      </Button>
    </form>
  );
}

function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  return { notice, setNotice, view: notice ? <Alert tone="success">{notice}</Alert> : null };
}

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

function AdminsTab({ myId }: { myId: string }) {
  const t = useTranslations('users');
  const { dateTime } = useDates();
  const queryClient = useQueryClient();
  const { setNotice, view } = useNotice();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const admins = useQuery({
    queryKey: ['users', 'admins'],
    queryFn: () => api<AdminUserItem[]>('/admin/v1/users/admins'),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['users', 'admins'] });

  return (
    <div className="space-y-4">
      {view}
      {adding ? (
        <NewAdmin
          onDone={(name) => {
            setAdding(false);
            refresh();
            setNotice(t('adminCreated', { name }));
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>{t('addAdmin')}</Button>
      )}
      <ApiErrorAlert error={admins.error} />
      <Table
        head={[t('cols.name'), t('cols.role'), t('cols.state'), t('cols.lastLogin'), '']}
        loading={admins.isPending && t('loading')}
      >
        {admins.data?.map((a) => (
          <AdminRow
            key={a.id}
            admin={a}
            isMe={a.id === myId}
            open={open === a.id}
            onToggle={() => setOpen(open === a.id ? null : a.id)}
            lastLogin={a.lastLoginAt ? dateTime(a.lastLoginAt) : t('never')}
            onChanged={(message) => {
              refresh();
              setNotice(message);
            }}
          />
        ))}
      </Table>
    </div>
  );
}

function AdminRow({
  admin,
  isMe,
  open,
  onToggle,
  lastLogin,
  onChanged,
}: {
  admin: AdminUserItem;
  isMe: boolean;
  open: boolean;
  onToggle: () => void;
  lastLogin: string;
  onChanged: (message: string) => void;
}) {
  const t = useTranslations('users');
  const update = useMutation({
    mutationFn: ({ body }: { body: object; done: string }) =>
      apiPatch<AdminUserItem>(`/admin/v1/users/admins/${admin.id}`, body),
    onSuccess: (_, { done }) => onChanged(done),
  });
  const totp = useMutation({
    mutationFn: () => apiPost<AdminUserItem>(`/admin/v1/users/admins/${admin.id}/totp-reset`),
    onSuccess: () => onChanged(t('totpReset')),
  });
  return (
    <>
      <tr>
        <Td>
          <p className="font-medium">
            {admin.name} {isMe && <span className="text-xs text-muted">({t('you')})</span>}
          </p>
          <p className="text-xs text-muted" dir="ltr">
            {admin.email}
          </p>
        </Td>
        <Td>{t(`adminRoles.${admin.role}`)}</Td>
        <Td>
          {admin.isActive ? t('active') : t('inactive')}
          {admin.totpEnabled ? ` · ${t('twoFactor')}` : ''}
        </Td>
        <Td className="whitespace-nowrap text-xs text-muted">{lastLogin}</Td>
        <Td>
          <Button variant="secondary" onClick={onToggle}>
            {open ? t('close') : t('manage')}
          </Button>
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <Actions>
              {!isMe && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        body: { role: admin.role === 'SUPER_ADMIN' ? 'ADMIN' : 'SUPER_ADMIN' },
                        done: t('roleChanged'),
                      })
                    }
                  >
                    {admin.role === 'SUPER_ADMIN' ? t('makeAdmin') : t('makeSuper')}
                  </Button>
                  <Button
                    variant={admin.isActive ? 'danger' : 'secondary'}
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        body: { isActive: !admin.isActive },
                        done: admin.isActive ? t('deactivated') : t('activated'),
                      })
                    }
                  >
                    {admin.isActive ? t('deactivate') : t('activate')}
                  </Button>
                  {admin.totpEnabled && (
                    <Button
                      variant="secondary"
                      disabled={totp.isPending}
                      onClick={() => totp.mutate()}
                    >
                      {t('resetTotp')}
                    </Button>
                  )}
                </div>
              )}
              <ApiErrorAlert error={update.error ?? totp.error} />
              <SetPassword
                url={`/admin/v1/users/admins/${admin.id}/password`}
                min={ADMIN_PASSWORD_MIN_LENGTH}
                onDone={onChanged}
              />
            </Actions>
          </td>
        </tr>
      )}
    </>
  );
}

function NewAdmin({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const [values, setValues] = useState({ name: '', email: '', role: 'ADMIN', password: '' });
  const create = useMutation({
    mutationFn: () => apiPost<AdminUserItem>('/admin/v1/users/admins', values),
    onSuccess: (a) => onDone(a.name),
  });
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues({ ...values, [key]: e.target.value });
  return (
    <Card title={t('addAdmin')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('cols.name')}>
            <Input value={values.name} onChange={set('name')} />
          </Field>
          <Field label={t('email')}>
            <Input type="email" dir="ltr" value={values.email} onChange={set('email')} />
          </Field>
          <Field label={t('cols.role')}>
            <Select value={values.role} onChange={set('role')}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`adminRoles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t('newPassword')}
            hint={t('newPasswordHint', { min: ADMIN_PASSWORD_MIN_LENGTH })}
          >
            <Input
              type="text"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={values.password}
              onChange={set('password')}
            />
          </Field>
        </div>
        <ApiErrorAlert error={create.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={create.isPending}>
            {t('addAdmin')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Garage staff
// ---------------------------------------------------------------------------

function StaffTab() {
  const t = useTranslations('users');
  const tStaff = useTranslations('staffRoles');
  const { dateTime } = useDates();
  const queryClient = useQueryClient();
  const { setNotice, view } = useNotice();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set('q', q);
  if (role) params.set('role', role);
  const staff = useQuery({
    queryKey: ['users', 'staff', q, role, page],
    queryFn: () => api<Paginated<AdminStaffItem>>(`/admin/v1/users/staff?${params}`),
  });
  const changed = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['users', 'staff'] });
    setNotice(message);
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(search.trim());
        }}
      >
        <Input
          className="w-64"
          placeholder={t('searchStaff')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-48"
          value={role}
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value);
          }}
        >
          <option value="">{t('allRoles')}</option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {tStaff(r)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t('search')}
        </Button>
      </form>
      {view}
      <ApiErrorAlert error={staff.error} />
      <Table
        head={[
          t('cols.name'),
          t('cols.garage'),
          t('cols.role'),
          t('cols.state'),
          t('cols.lastLogin'),
          '',
        ]}
        loading={staff.isPending && t('loading')}
        empty={staff.data?.total === 0 && t('empty')}
      >
        {staff.data?.items.map((u) => (
          <StaffRow
            key={u.id}
            user={u}
            open={open === u.id}
            onToggle={() => setOpen(open === u.id ? null : u.id)}
            lastLogin={u.lastLoginAt ? dateTime(u.lastLoginAt) : t('never')}
            onChanged={changed}
          />
        ))}
      </Table>
      {staff.data && (
        <Pager
          page={page}
          pageSize={staff.data.pageSize}
          total={staff.data.total}
          totalText={t('total', { count: staff.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function StaffRow({
  user,
  open,
  onToggle,
  lastLogin,
  onChanged,
}: {
  user: AdminStaffItem;
  open: boolean;
  onToggle: () => void;
  lastLogin: string;
  onChanged: (message: string) => void;
}) {
  const t = useTranslations('users');
  const tStaff = useTranslations('staffRoles');
  const link = useMutation({
    mutationFn: () => apiPost<SentLink>(`/admin/v1/users/staff/${user.id}/link`),
    onSuccess: (sent) =>
      onChanged(t(sent.kind === 'invite' ? 'inviteSent' : 'resetSent', { email: sent.email })),
  });
  const toggle = useMutation({
    mutationFn: () =>
      apiPatch<AdminStaffItem>(`/admin/v1/users/staff/${user.id}`, { isActive: !user.isActive }),
    onSuccess: () => onChanged(user.isActive ? t('deactivated') : t('activated')),
  });
  return (
    <>
      <tr>
        <Td>
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted" dir="ltr">
            {user.email}
          </p>
        </Td>
        <Td>
          <p>{user.garage.name}</p>
          <p className="text-xs text-muted">{user.branchName ?? t('allBranches')}</p>
        </Td>
        <Td>{tStaff(user.role)}</Td>
        <Td>
          {user.isActive ? t('active') : t('inactive')}
          {user.hasPassword ? '' : ` · ${t('noPassword')}`}
        </Td>
        <Td className="whitespace-nowrap text-xs text-muted">{lastLogin}</Td>
        <Td>
          <Button variant="secondary" onClick={onToggle}>
            {open ? t('close') : t('manage')}
          </Button>
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6}>
            <Actions>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={link.isPending || !user.isActive}
                  onClick={() => link.mutate()}
                >
                  {user.hasPassword ? t('sendReset') : t('sendInvite')}
                </Button>
                {user.role !== 'OWNER' && (
                  <Button
                    variant={user.isActive ? 'danger' : 'secondary'}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate()}
                  >
                    {user.isActive ? t('deactivate') : t('activate')}
                  </Button>
                )}
              </div>
              {user.role === 'OWNER' && <p className="text-xs text-muted">{t('ownerHint')}</p>}
              <ApiErrorAlert error={link.error ?? toggle.error} />
              <SetPassword
                url={`/admin/v1/users/staff/${user.id}/password`}
                min={PASSWORD_MIN_LENGTH}
                onDone={onChanged}
              />
            </Actions>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Car owners
// ---------------------------------------------------------------------------

function OwnersTab() {
  const t = useTranslations('users');
  const { dateTime } = useDates();
  const queryClient = useQueryClient();
  const { setNotice, view } = useNotice();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [account, setAccount] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set('q', q);
  if (account) params.set('account', account);
  const owners = useQuery({
    queryKey: ['users', 'owners', q, account, page],
    queryFn: () => api<Paginated<AdminOwnerItem>>(`/admin/v1/users/owners?${params}`),
    // Each load is written to the audit log: no reload on tab focus.
    refetchOnWindowFocus: false,
  });
  const changed = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ['users', 'owners'] });
    setNotice(message);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{t('ownersPrivacy')}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQ(search.trim());
        }}
      >
        <Input
          className="w-64"
          placeholder={t('searchOwners')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-48"
          value={account}
          onChange={(e) => {
            setPage(1);
            setAccount(e.target.value);
          }}
        >
          <option value="">{t('allAccounts')}</option>
          {OWNER_ACCOUNT_STATES.map((s) => (
            <option key={s} value={s}>
              {t(`account.${s}`)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t('search')}
        </Button>
      </form>
      {view}
      <ApiErrorAlert error={owners.error} />
      <Table
        head={[t('cols.name'), t('cols.garages'), t('cols.state'), t('cols.lastLogin'), '']}
        loading={owners.isPending && t('loading')}
        empty={owners.data?.total === 0 && t('empty')}
      >
        {owners.data?.items.map((o) => (
          <OwnerRow
            key={o.id}
            owner={o}
            open={open === o.id}
            onToggle={() => setOpen(open === o.id ? null : o.id)}
            lastLogin={o.lastLoginAt ? dateTime(o.lastLoginAt) : t('never')}
            onChanged={changed}
          />
        ))}
      </Table>
      {owners.data && (
        <Pager
          page={page}
          pageSize={owners.data.pageSize}
          total={owners.data.total}
          totalText={t('total', { count: owners.data.total })}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function OwnerRow({
  owner,
  open,
  onToggle,
  lastLogin,
  onChanged,
}: {
  owner: AdminOwnerItem;
  open: boolean;
  onToggle: () => void;
  lastLogin: string;
  onChanged: (message: string) => void;
}) {
  const t = useTranslations('users');
  const [confirmClose, setConfirmClose] = useState(false);
  const link = useMutation({
    mutationFn: () => apiPost<SentLink>(`/admin/v1/users/owners/${owner.id}/link`),
    onSuccess: (sent) =>
      onChanged(t(sent.kind === 'invite' ? 'inviteSent' : 'resetSent', { email: sent.email })),
  });
  const close = useMutation({
    mutationFn: () => apiPost<void>(`/admin/v1/users/owners/${owner.id}/close-account`),
    onSuccess: () => {
      setConfirmClose(false);
      onChanged(t('accountClosed'));
    },
  });
  return (
    <>
      <tr>
        <Td>
          <p className="font-medium">{owner.name}</p>
          <p className="text-xs text-muted" dir="ltr">
            {owner.phone}
            {owner.email ? ` · ${owner.email}` : ''}
          </p>
        </Td>
        <Td className="text-xs">{owner.garages.map((g) => g.name).join(', ') || '—'}</Td>
        <Td>{t(`account.${owner.account}`)}</Td>
        <Td className="whitespace-nowrap text-xs text-muted">{lastLogin}</Td>
        <Td>
          <Button variant="secondary" onClick={onToggle}>
            {open ? t('close') : t('manage')}
          </Button>
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <Actions>
              {owner.account === 'NONE' ? (
                <p className="text-sm text-muted">{t('noLogin')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={link.isPending}
                      onClick={() => link.mutate()}
                    >
                      {owner.account === 'ACTIVE' ? t('sendReset') : t('sendInvite')}
                    </Button>
                    {confirmClose ? (
                      <>
                        <Button
                          variant="danger"
                          disabled={close.isPending}
                          onClick={() => close.mutate()}
                        >
                          {t('confirmClose')}
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirmClose(false)}>
                          {t('keep')}
                        </Button>
                      </>
                    ) : (
                      <Button variant="danger" onClick={() => setConfirmClose(true)}>
                        {t('closeAccount')}
                      </Button>
                    )}
                  </div>
                  {confirmClose && <p className="text-xs text-muted">{t('closeHint')}</p>}
                  <ApiErrorAlert error={link.error ?? close.error} />
                  <SetPassword
                    url={`/admin/v1/users/owners/${owner.id}/password`}
                    min={PASSWORD_MIN_LENGTH}
                    onDone={onChanged}
                  />
                </>
              )}
            </Actions>
          </td>
        </tr>
      )}
    </>
  );
}
