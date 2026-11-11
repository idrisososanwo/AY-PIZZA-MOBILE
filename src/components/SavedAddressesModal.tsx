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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { CustomerAddress, NewAddressInput } from '../domains/customer/customer-types';
import { customerService } from '../domains/customer/customer-service';
import { deliveryPricingEngine } from '../domains/delivery/delivery-pricing-engine';
import { locationService, Coordinates } from '../domains/delivery/location-service';
import { DeliveryLandmark } from '../types/delivery';

const GUEST_ADDRESSES_STORAGE_KEY = '@aypizza_guest_addresses';

interface SavedAddressesModalProps {
  visible: boolean;
  userId?: string;
  onClose: () => void;
  onSelectAddress?: (address: CustomerAddress) => void;
}

const ADDRESS_TYPE_CHIPS = ['Hostel', 'Faculty / Dept', 'Staff Quarters', 'Off-Campus Home', 'Office'];

export const SavedAddressesModal: React.FC<SavedAddressesModalProps> = ({
  visible,
  userId,
  onClose,
  onSelectAddress,
}) => {
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [landmarks, setLandmarks] = useState<DeliveryLandmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('Hostel');
  const [selectedLandmark, setSelectedLandmark] = useState<DeliveryLandmark>(
    deliveryPricingEngine.getActiveLandmarks()[0]
  );
  const [landmarkDropdownOpen, setLandmarkDropdownOpen] = useState(false);
  const [landmarkSearch, setLandmarkSearch] = useState('');
  const [estateOrHostel, setEstateOrHostel] = useState('');
  const [roomOrPlot, setRoomOrPlot] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationAssistNote, setLocationAssistNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      await deliveryPricingEngine.initialize();
      const activeLms = deliveryPricingEngine.getActiveLandmarks();
      setLandmarks(activeLms);
      if (activeLms.length > 0) {
        setSelectedLandmark((prev) => prev || activeLms[0]);
      }

      if (userId) {
        const res = await customerService.getAddresses(userId);
        if (res.success) {
          setAddresses(res.addresses);
        }
      } else {
        // Load guest addresses from local device storage
        try {
          const raw = await AsyncStorage.getItem(GUEST_ADDRESSES_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            setAddresses(Array.isArray(parsed) ? parsed : []);
          } else {
            setAddresses([]);
          }
        } catch {
          setAddresses([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const openAddForm = () => {
    setEditingAddressId(null);
    const activeLms = deliveryPricingEngine.getActiveLandmarks();
    setSelectedLandmark(activeLms[0] || landmarks[0]);
    setTitle('Hostel');
    setEstateOrHostel('');
    setRoomOrPlot('');
    setStreetAddress('');
    setContactPhone('');
    setDeliveryNotes('');
    setCoords(null);
    setLocationAssistNote(null);
    setIsDefault(addresses.length === 0);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const openEditForm = (addr: CustomerAddress) => {
    setEditingAddressId(addr.id);
    const activeLms = deliveryPricingEngine.getActiveLandmarks();
    const lm = activeLms.find((l) => l.id === addr.landmarkId) || activeLms[0];
    setSelectedLandmark(lm);
    setTitle(addr.title || 'Hostel');
    setEstateOrHostel(addr.estateOrHostel || '');
    setRoomOrPlot(addr.roomOrPlot || addr.detailedAddress || '');
    setStreetAddress(addr.streetAddress || '');
    setContactPhone(addr.contactPhone);
    setDeliveryNotes(addr.deliveryNotes || '');
    setCoords(
      addr.latitude && addr.longitude
        ? { latitude: addr.latitude, longitude: addr.longitude }
        : null
    );
    setLocationAssistNote(null);
    setIsDefault(addr.isDefault);
    setErrorMsg(null);
    setIsEditing(true);
  };

  // Optional GPS Location Assist
  const handleLocationAssist = async () => {
    try {
      setLocating(true);
      setErrorMsg(null);
      const result = await locationService.assistAddressSelection(landmarks);

      if (result.success && result.coordinates) {
        setCoords(result.coordinates);
        if (result.suggestedLandmark) {
          setSelectedLandmark(result.suggestedLandmark);
        }
        if (result.geocoded) {
          if (result.geocoded.street && !streetAddress) {
            setStreetAddress(result.geocoded.street);
          }
          if (result.geocoded.estateOrBuilding && !estateOrHostel) {
            setEstateOrHostel(result.geocoded.estateOrBuilding);
          }
        }
        setLocationAssistNote(
          `GPS detected (~${result.distanceFromStoreKm} km from AY Pizza). Closest landmark: ${result.suggestedLandmark?.name}`
        );
      } else {
        Alert.alert(
          'Location Optional',
          result.error || 'Device location is optional. You can enter your address manually.'
        );
      }
    } catch {
      Alert.alert('Location Notice', 'Could not get location. You can enter your address details manually.');
    } finally {
      setLocating(false);
    }
  };

  const handleSaveAddress = async () => {
    // Validate required fields
    if (!estateOrHostel.trim() && !roomOrPlot.trim() && !streetAddress.trim()) {
      setErrorMsg('Please specify your hostel/estate name and room or building details.');
      return;
    }

    const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    if (!selectedLandmark) {
      setErrorMsg('Please select a delivery landmark.');
      return;
    }

    // Build composite detailed address
    const addressParts: string[] = [];
    if (estateOrHostel.trim()) addressParts.push(estateOrHostel.trim());
    if (roomOrPlot.trim()) addressParts.push(roomOrPlot.trim());
    if (streetAddress.trim()) addressParts.push(streetAddress.trim());
    const composedDetailed = addressParts.join(', ');

    try {
      setSaving(true);
      setErrorMsg(null);

      const input: NewAddressInput = {
        title: title.trim() || 'Saved Address',
        landmarkId: selectedLandmark.id,
        detailedAddress: composedDetailed,
        estateOrHostel: estateOrHostel.trim() || undefined,
        roomOrPlot: roomOrPlot.trim() || undefined,
        streetAddress: streetAddress.trim() || undefined,
        area: selectedLandmark.name,
        contactPhone: contactPhone.trim(),
        deliveryNotes: deliveryNotes.trim() || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        isDefault,
      };

      if (userId) {
        if (editingAddressId) {
          const res = await customerService.updateAddress(userId, editingAddressId, input);
          if (res.success) {
            setIsEditing(false);
            await loadData();
          } else {
            setErrorMsg(res.error || 'Failed to update address.');
          }
        } else {
          const res = await customerService.addAddress(userId, input);
          if (res.success) {
            setIsEditing(false);
            await loadData();
          } else {
            setErrorMsg(res.error || 'Failed to add address.');
          }
        }
      } else {
        // Guest mode: Save address directly to local device storage
        try {
          let updatedList: CustomerAddress[] = [...addresses];
          if (editingAddressId) {
            updatedList = updatedList.map((a) => {
              if (a.id === editingAddressId) {
                return {
                  ...a,
                  ...input,
                  landmarkName: selectedLandmark.name,
                  updatedAt: new Date().toISOString(),
                };
              }
              return isDefault ? { ...a, isDefault: false } : a;
            });
          } else {
            if (isDefault) {
              updatedList = updatedList.map((a) => ({ ...a, isDefault: false }));
            }
            const newGuestAddr: CustomerAddress = {
              id: 'guest_addr_' + Date.now(),
              customerId: 'guest',
              landmarkId: selectedLandmark.id,
              landmarkName: selectedLandmark.name,
              title: input.title,
              detailedAddress: input.detailedAddress,
              estateOrHostel: input.estateOrHostel || null,
              roomOrPlot: input.roomOrPlot || null,
              streetAddress: input.streetAddress || null,
              area: input.area || null,
              contactPhone: input.contactPhone,
              deliveryNotes: input.deliveryNotes || null,
              latitude: input.latitude || null,
              longitude: input.longitude || null,
              isDefault,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            updatedList.unshift(newGuestAddr);
          }
          await AsyncStorage.setItem(GUEST_ADDRESSES_STORAGE_KEY, JSON.stringify(updatedList));
          setAddresses(updatedList);
          setIsEditing(false);
        } catch (err: any) {
          setErrorMsg('Failed to save guest address: ' + (err?.message || 'Storage error'));
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: CustomerAddress) => {
    Alert.alert(
      'Delete Address',
      `Are you sure you want to delete "${addr.title || addr.detailedAddress}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (userId) {
              await customerService.deleteAddress(userId, addr.id);
            } else {
              const updated = addresses.filter((a) => a.id !== addr.id);
              await AsyncStorage.setItem(GUEST_ADDRESSES_STORAGE_KEY, JSON.stringify(updated));
              setAddresses(updated);
            }
            await loadData();
          },
        },
      ]
    );
  };

  const handleSetDefault = async (addrId: string) => {
    if (userId) {
      await customerService.setDefaultAddress(userId, addrId);
    } else {
      const updated = addresses.map((a) => ({
        ...a,
        isDefault: a.id === addrId,
      }));
      await AsyncStorage.setItem(GUEST_ADDRESSES_STORAGE_KEY, JSON.stringify(updated));
      setAddresses(updated);
    }
    await loadData();
  };

  const filteredLandmarks = landmarks.filter((lm) =>
    lm.name.toLowerCase().includes(landmarkSearch.toLowerCase())
  );

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
                {isEditing
                  ? 'Hostels, faculty blocks, and surrounding Lagos Mainland'
                  : 'Quickly select where to receive your hot pizza'}
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isEditing ? (
            /* ADDRESS FORM */
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {errorMsg && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                </View>
              )}

              {/* Address Type Selector */}
              <Text style={styles.fieldLabel}>Address Label</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {ADDRESS_TYPE_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    style={[styles.chip, title === chip && styles.chipActive]}
                    onPress={() => setTitle(chip)}
                  >
                    <Text style={[styles.chipText, title === chip && styles.chipTextActive]}>
                      {chip}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Optional GPS Assist Button */}
              <View style={styles.gpsContainer}>
                <TouchableOpacity
                  style={styles.gpsBtn}
                  onPress={handleLocationAssist}
                  disabled={locating}
                  activeOpacity={0.8}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={Colors.primaryRed} />
                  ) : (
                    <Text style={styles.gpsBtnText}>📍 Use My Current Location (Optional Assist)</Text>
                  )}
                </TouchableOpacity>
                {locationAssistNote && (
                  <Text style={styles.gpsNoteText}>✓ {locationAssistNote}</Text>
                )}
              </View>

              {/* Delivery Landmark Selector */}
              <Text style={styles.fieldLabel}>Delivery Landmark & Zone *</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setLandmarkDropdownOpen(!landmarkDropdownOpen)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownBtnText}>
                    📍 {selectedLandmark ? selectedLandmark.name : 'Select Landmark'}
                  </Text>
                  <Text style={styles.dropdownSubtext}>
                    Delivery fee: ₦{selectedLandmark ? selectedLandmark.fee.toLocaleString() : '0'} •{' '}
                    {selectedLandmark?.isCampus ? 'UNILAG Campus' : 'Mainland'}
                  </Text>
                </View>
                <Text style={styles.caret}>{landmarkDropdownOpen ? '▴' : '▾'}</Text>
              </TouchableOpacity>

              {landmarkDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TextInput
                    style={styles.landmarkSearchInput}
                    placeholder="Search landmark (e.g. Akoka, Yaba, Jaja)..."
                    placeholderTextColor="#85746E"
                    selectionColor={Colors.primaryRed}
                    value={landmarkSearch}
                    onChangeText={setLandmarkSearch}
                  />
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {filteredLandmarks.map((lm) => (
                      <TouchableOpacity
                        key={lm.id}
                        style={[
                          styles.dropdownItem,
                          lm.id === selectedLandmark?.id && styles.dropdownItemSelected,
                        ]}
                        onPress={() => {
                          setSelectedLandmark(lm);
                          setLandmarkDropdownOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            lm.id === selectedLandmark?.id && styles.dropdownItemTextSelected,
                          ]}
                        >
                          {lm.name} • ₦{lm.fee.toLocaleString()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Hostel / Estate / Building */}
              <Text style={styles.fieldLabel}>Hostel, Hall, Estate or Building Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. King Jaja Hall, Moremi, Fagunwa, Staff Quarters"
                placeholderTextColor="#85746E"
                selectionColor={Colors.primaryRed}
                value={estateOrHostel}
                onChangeText={setEstateOrHostel}
              />

              {/* Room / Flat / Floor */}
              <Text style={styles.fieldLabel}>Room, Flat, Floor or Office Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Block B, Room 14 / Floor 2, Office 204"
                placeholderTextColor="#85746E"
                selectionColor={Colors.primaryRed}
                value={roomOrPlot}
                onChangeText={setRoomOrPlot}
              />

              {/* Street Name (Optional for off-campus) */}
              <Text style={styles.fieldLabel}>Street Name / Area (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Commercial Avenue, St. Finbarr's Road"
                placeholderTextColor="#85746E"
                selectionColor={Colors.primaryRed}
                value={streetAddress}
                onChangeText={setStreetAddress}
              />

              {/* Contact Phone Number */}
              <Text style={styles.fieldLabel}>Contact Phone (Rider Call / WhatsApp) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0812 345 6789"
                placeholderTextColor="#85746E"
                selectionColor={Colors.primaryRed}
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />

              {/* Delivery Instructions */}
              <Text style={styles.fieldLabel}>Delivery Instructions (Optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="e.g. Drop at porter's desk / Call when outside the hall gate"
                placeholderTextColor="#85746E"
                selectionColor={Colors.primaryRed}
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
                multiline
              />

              {/* Default Address Switch */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Set as Default Delivery Address</Text>
                  <Text style={styles.switchSubtext}>Use automatically for future deliveries</Text>
                </View>
                <Switch
                  value={isDefault}
                  onValueChange={setIsDefault}
                  trackColor={{ false: '#E0D8D0', true: Colors.primaryRed }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Save Button */}
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
                    {editingAddressId ? 'Update Delivery Address' : 'Save Delivery Address 📍'}
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
                  {!userId && (
                    <View style={styles.guestNoticeBanner}>
                      <Text style={styles.guestNoticeIcon}>💡</Text>
                      <Text style={styles.guestNoticeText}>
                        Guest Addresses: Saved on this device. Sign in from Account to sync across devices.
                      </Text>
                    </View>
                  )}
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
                  {!userId && (
                    <View style={styles.guestNoticeBanner}>
                      <Text style={styles.guestNoticeIcon}>💡</Text>
                      <Text style={styles.guestNoticeText}>
                        Guest Addresses: Saved on this device. Sign in from Account to sync across devices.
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.addBtnTop} onPress={openAddForm} activeOpacity={0.85}>
                    <Text style={styles.addBtnTopText}>+ Add New Address</Text>
                  </TouchableOpacity>

                  {addresses.map((addr) => (
                    <View
                      key={addr.id}
                      style={[styles.addressCard, addr.isDefault && styles.addressCardDefault]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.titleRow}>
                          <Text style={styles.addressTitleText}>🏷️ {addr.title || 'Saved Address'}</Text>
                          {addr.isDefault && (
                            <View style={styles.defaultBadge}>
                              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.landmarkBadge}>
                          <Text style={styles.landmarkBadgeText}>📍 {addr.landmarkName}</Text>
                        </View>
                      </View>

                      <Text style={styles.addressDetailText}>{addr.detailedAddress}</Text>
                      <Text style={styles.addressPhoneText}>📞 {addr.contactPhone}</Text>
                      {addr.deliveryNotes && (
                        <Text style={styles.addressNotesText}>📝 Note: {addr.deliveryNotes}</Text>
                      )}

                      {/* Action Buttons */}
                      <View style={styles.actionRow}>
                        {onSelectAddress && (
                          <TouchableOpacity
                            style={styles.selectBtn}
                            onPress={() => {
                              onSelectAddress(addr);
                              onClose();
                            }}
                            activeOpacity={0.8}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.selectBtnText}>Select for Order ✓</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => openEditForm(addr)}
                          activeOpacity={0.8}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.editBtnText}>Edit ✏️</Text>
                        </TouchableOpacity>
                        {!addr.isDefault && (
                          <TouchableOpacity
                            style={styles.defaultBtn}
                            onPress={() => handleSetDefault(addr.id)}
                            activeOpacity={0.8}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.defaultBtnText}>Make Default</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDelete(addr)}
                          activeOpacity={0.8}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.deleteBtnText}>Delete 🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.warmCream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F1F1F',
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  guestNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1D6',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  guestNoticeIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#3E2723',
    lineHeight: 16,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(62, 39, 35, 0.08)',
    borderRadius: 16,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  errorBanner: {
    backgroundColor: '#FFE5E5',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#B91C1C',
    borderColor: '#B91C1C',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  gpsContainer: {
    marginBottom: 14,
  },
  gpsBtn: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.25)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  gpsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  gpsNoteText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4C9BF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1F1F1F',
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  dropdownBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4C9BF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dropdownBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  dropdownSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  caret: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4C9BF',
    borderRadius: 10,
    padding: 8,
    marginBottom: 14,
  },
  landmarkSearchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4C9BF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1F1F1F',
    marginBottom: 8,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE5',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#1F1F1F',
  },
  dropdownItemTextSelected: {
    fontWeight: '700',
    color: Colors.primaryRed,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 14,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.charcoal,
  },
  switchSubtext: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: '#B91C1C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
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
    paddingHorizontal: 30,
    marginBottom: 20,
    lineHeight: 18,
  },
  addBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  addBtnTop: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.primaryRed,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  addBtnTopText: {
    color: Colors.primaryRed,
    fontWeight: '700',
    fontSize: 13,
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressCardDefault: {
    borderColor: Colors.primaryRed,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.charcoal,
    marginRight: 6,
  },
  defaultBadge: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  landmarkBadge: {
    backgroundColor: '#F3EFE9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  landmarkBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.charcoal,
  },
  addressDetailText: {
    fontSize: 13,
    color: Colors.charcoal,
    lineHeight: 18,
    marginBottom: 4,
  },
  addressPhoneText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  addressNotesText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5EFEB',
  },
  selectBtn: {
    backgroundColor: Colors.primaryRed,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 12,
    color: Colors.charcoal,
    fontWeight: '600',
  },
  defaultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultBtnText: {
    fontSize: 12,
    color: Colors.primaryRed,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginLeft: 'auto',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
  },
});
