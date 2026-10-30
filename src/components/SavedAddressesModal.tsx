import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { CustomerAddress, NewAddressInput } from '../domains/customer/customer-types';
import { customerService } from '../domains/customer/customer-service';
import { PROVISIONAL_LANDMARKS } from '../domains/delivery/delivery-service';
import { DeliveryLandmark } from '../types/delivery';

interface SavedAddressesModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSelectAddress?: (address: CustomerAddress) => void;
}

export const SavedAddressesModal: React.FC<SavedAddressesModalProps> = ({
  visible,
  userId,
  onClose,
  onSelectAddress,
}) => {
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Form State
  const [selectedLandmark, setSelectedLandmark] = useState<DeliveryLandmark>(PROVISIONAL_LANDMARKS[0]);
  const [landmarkDropdownOpen, setLandmarkDropdownOpen] = useState(false);
  const [detailedAddress, setDetailedAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await customerService.getAddresses(userId);
      if (res.success) {
        setAddresses(res.addresses);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible && userId) {
      loadAddresses();
    }
  }, [visible, userId, loadAddresses]);

  const openAddForm = () => {
    setEditingAddressId(null);
    setSelectedLandmark(PROVISIONAL_LANDMARKS[0]);
    setDetailedAddress('');
    setContactPhone('');
    setDeliveryNotes('');
    setIsDefault(addresses.length === 0);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const openEditForm = (addr: CustomerAddress) => {
    setEditingAddressId(addr.id);
    const landmark = PROVISIONAL_LANDMARKS.find((l) => l.id === addr.landmarkId) || PROVISIONAL_LANDMARKS[0];
    setSelectedLandmark(landmark);
    setDetailedAddress(addr.detailedAddress);
    setContactPhone(addr.contactPhone);
    setDeliveryNotes(addr.deliveryNotes || '');
    setIsDefault(addr.isDefault);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleSaveAddress = async () => {
    if (!detailedAddress.trim()) {
      setErrorMsg('Please specify room number, block, or detailed location.');
      return;
    }
    const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);

      const input: NewAddressInput = {
        landmarkId: selectedLandmark.id,
        detailedAddress: detailedAddress.trim(),
        contactPhone: contactPhone.trim(),
        deliveryNotes: deliveryNotes.trim() || undefined,
        isDefault,
      };

      if (editingAddressId) {
        const res = await customerService.updateAddress(userId, editingAddressId, input);
        if (res.success) {
          setIsEditing(false);
          await loadAddresses();
        } else {
          setErrorMsg(res.error || 'Failed to update address.');
        }
      } else {
        const res = await customerService.addAddress(userId, input);
        if (res.success) {
          setIsEditing(false);
          await loadAddresses();
        } else {
          setErrorMsg(res.error || 'Failed to add address.');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: CustomerAddress) => {
    Alert.alert(
      'Delete Address',
      `Are you sure you want to delete "${addr.detailedAddress}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await customerService.deleteAddress(userId, addr.id);
            await loadAddresses();
          },
        },
      ]
    );
  };

  const handleSetDefault = async (addrId: string) => {
    await customerService.setDefaultAddress(userId, addrId);
    await loadAddresses();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.title}>
                {isEditing ? (editingAddressId ? 'Edit Address' : 'Add New Address') : 'Saved Delivery Addresses 📍'}
              </Text>
              <Text style={styles.subtitle}>
                {isEditing ? 'Hostel rooms, faculty blocks & campus delivery points' : 'Quickly select where to receive your orders'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (isEditing) {
                  setIsEditing(false);
                } else {
                  onClose();
                }
              }}
              style={styles.closeBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            /* ADDRESS FORM */
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
              showsVerticalScrollIndicator={false}
            >
              {errorMsg && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>Delivery Landmark *</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setLandmarkDropdownOpen(!landmarkDropdownOpen)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownBtnText}>
                  📍 {selectedLandmark.name} (₦{selectedLandmark.fee.toLocaleString()})
                </Text>
                <Text style={styles.caret}>{landmarkDropdownOpen ? '▴' : '▾'}</Text>
              </TouchableOpacity>

              {landmarkDropdownOpen && (
                <View style={styles.dropdownList}>
                  {PROVISIONAL_LANDMARKS.map((lm) => (
                    <TouchableOpacity
                      key={lm.id}
                      style={[
                        styles.dropdownItem,
                        lm.id === selectedLandmark.id && styles.dropdownItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedLandmark(lm);
                        setLandmarkDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          lm.id === selectedLandmark.id && styles.dropdownItemTextSelected,
                        ]}
                      >
                        {lm.name} • ₦{lm.fee.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Detailed Address / Room Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. King Jaja Hall, Block A, Room 14"
                placeholderTextColor={Colors.textMuted}
                value={detailedAddress}
                onChangeText={setDetailedAddress}
              />

              <Text style={styles.fieldLabel}>Contact Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0812 345 6789"
                placeholderTextColor={Colors.textMuted}
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Delivery Instructions (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Call when outside the hall gate"
                placeholderTextColor={Colors.textMuted}
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Set as Default Address</Text>
                  <Text style={styles.switchSubtext}>Use automatically for upcoming orders</Text>
                </View>
                <Switch
                  value={isDefault}
                  onValueChange={setIsDefault}
                  trackColor={{ false: '#E0D8D0', true: Colors.primaryRed }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                onPress={handleSaveAddress}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingAddressId ? 'Update Address' : 'Save Address 📍'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ADDRESS LIST */
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 12, 24) }}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={Colors.primaryRed} />
                  <Text style={styles.loadingText}>Loading saved addresses...</Text>
                </View>
              ) : addresses.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyEmoji}>📍</Text>
                  <Text style={styles.emptyTitle}>No saved addresses yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Save your hostel room or UNILAG location for instant 1-touch checkout.
                  </Text>
                  <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
                    <Text style={styles.addBtnText}>+ Add New Address</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ paddingBottom: 20 }}>
                  <TouchableOpacity style={styles.addBtnTop} onPress={openAddForm} activeOpacity={0.85}>
                    <Text style={styles.addBtnTopText}>+ Add New Address</Text>
                  </TouchableOpacity>

                  {addresses.map((addr) => (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.addressCard, addr.isDefault && styles.addressCardDefault]}
                      onPress={() => {
                        if (onSelectAddress) {
                          onSelectAddress(addr);
                          onClose();
                        }
                      }}
                      activeOpacity={onSelectAddress ? 0.75 : 1}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.landmarkBadge}>
                          <Text style={styles.landmarkBadgeText}>📍 {addr.landmarkName}</Text>
                        </View>
                        {addr.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.cardAddress}>{addr.detailedAddress}</Text>
                      <Text style={styles.cardPhone}>📞 {addr.contactPhone}</Text>
                      {addr.deliveryNotes && (
                        <Text style={styles.cardNotes}>{`📝 "${addr.deliveryNotes}"`}</Text>
                      )}

                      <View style={styles.cardActions}>
                        {!addr.isDefault && (
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleSetDefault(addr.id)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.actionText}>Make Default</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openEditForm(addr)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.actionText}>Edit ✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtnDanger}
                          onPress={() => handleDelete(addr)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.actionTextDanger}>Delete 🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 33, 31, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.charcoal,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 33, 31, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  scrollBody: {
    padding: 18,
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 10,
    fontWeight: '600',
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.charcoal,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  addBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  addBtnTop: {
    backgroundColor: Colors.warmCream,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryRed,
  },
  addBtnTopText: {
    color: Colors.primaryRed,
    fontSize: 13,
    fontWeight: '800',
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.1)',
    shadowColor: '#27211F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  addressCardDefault: {
    borderColor: Colors.primaryRed,
    borderWidth: 1.5,
    backgroundColor: '#FFF9F7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  landmarkBadge: {
    backgroundColor: Colors.warmCream,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  landmarkBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  defaultBadge: {
    backgroundColor: Colors.goldenYellow,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#27211F',
  },
  cardAddress: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.charcoal,
    marginTop: 4,
  },
  cardPhone: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  cardNotes: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(39, 33, 31, 0.06)',
  },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  actionBtnDanger: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionTextDanger: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  errorBanner: {
    backgroundColor: Colors.softTomato,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(201, 35, 43, 0.2)',
  },
  errorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.charcoal,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.warmCream,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.12)',
  },
  dropdownBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  caret: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(39, 33, 31, 0.15)',
    maxHeight: 180,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39, 33, 31, 0.06)',
  },
  dropdownItemSelected: {
    backgroundColor: '#FFF1EF',
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.charcoal,
    fontWeight: '600',
  },
  dropdownItemTextSelected: {
    color: Colors.primaryRed,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  switchSubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: Colors.primaryRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: Colors.primaryRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

