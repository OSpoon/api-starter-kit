<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'

import AccountList from '../features/authenticator/components/AccountList.vue'
import AccountEditorDialog from '../features/authenticator/components/AccountEditorDialog.vue'
import AccountTransferDialog from '../features/authenticator/components/AccountTransferDialog.vue'
import AddAccountDialog from '../features/authenticator/components/AddAccountDialog.vue'
import DeleteAccountDialog from '../features/authenticator/components/DeleteAccountDialog.vue'
import SortAccountsDialog from '../features/authenticator/components/SortAccountsDialog.vue'
import { useAuthenticator } from '../features/authenticator/composables/useAuthenticator'

const {
  accountBeingEdited,
  accountToDelete,
  accounts,
  busy,
  changeSortMode,
  codes,
  copyCode,
  deleteAccount,
  filteredAccounts,
  isNative,
  loading,
  moveAccount,
  notice,
  now,
  openAddMenu,
  openEditForm,
  openManualForm,
  openSortMenu,
  requestDelete,
  saveAccount,
  scanSetupCode,
  search,
  showAccountForm,
  showAddMenu,
  showDeleteDialog,
  showSortMenu,
  sortMode,
  transfer,
  vaultReady,
} = useAuthenticator()
</script>

<template>
  <AccountList
    v-model:search="search"
    :accounts="accounts"
    :filtered-accounts="filteredAccounts"
    :sort-mode="sortMode"
    :codes="codes"
    :notice="notice"
    :loading="loading"
    :vault-ready="vaultReady"
    :busy="busy"
    :now="now"
    @open-sort="openSortMenu"
    @open-transfer="transfer.openTransfer"
    @open-add="openAddMenu"
    @edit="openEditForm"
    @move="moveAccount"
    @delete="requestDelete"
    @copy="copyCode"
  />
  <AddAccountDialog
    v-model:open="showAddMenu"
    :busy="busy"
    @scan="scanSetupCode"
    @manual="openManualForm"
  />
  <SortAccountsDialog
    v-model:open="showSortMenu"
    :busy="busy"
    :sort-mode="sortMode"
    @select="changeSortMode"
  />
  <AccountTransferDialog
    :controller="transfer"
    :accounts="accounts"
    :busy="busy"
    :is-native="isNative"
  />
  <AccountEditorDialog
    v-model:open="showAccountForm"
    :editing-account="accountBeingEdited"
    :notice="notice"
    :busy="busy"
    :vault-ready="vaultReady"
    @save="saveAccount"
  />
  <DeleteAccountDialog
    v-model:open="showDeleteDialog"
    :account="accountToDelete"
    :busy="busy"
    :notice="notice"
    @confirm="deleteAccount"
  />
  <Toaster position="bottom-center" />
</template>
